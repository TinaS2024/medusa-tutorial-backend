"use client"

import { addToCart } from "@lib/data/cart";
import { useIntersection } from "@lib/hooks/use-in-view";
import { HttpTypes } from "@medusajs/types";
import { Button } from "@medusajs/ui";
import Divider from "@modules/common/components/divider";
import OptionSelect from "@modules/products/components/product-actions/option-select";
import { isEqual } from "lodash";
import { useParams } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import ProductPrice from "../product-price";
import MobileActions from "./mobile-actions";
import Input from "../../../common/components/input";


type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

const optionsAsKeymap = (
  variantOptions: HttpTypes.StoreProductVariant["options"]
) => {
  return variantOptions?.reduce((acc: Record<string, string>, varopt: any) => {
    acc[varopt.option_id] = varopt.value
    return acc
  }, {})
}

export default function ProductActions({
  product,
  disabled,
  region,
}: ProductActionsProps) {
  const [options, setOptions] = useState<Record<string, string | undefined>>({});
  const [isAdding, setIsAdding] = useState(false);
  const countryCode = useParams().countryCode as string;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleUploadClick = () =>{
    fileInputRef.current?.click();
  };
  const [uploadedImageData, setUploadedImageData] = useState<string | null>(null);

  const loadImage =(src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    })
  }

  const [height,setHeight] = useState(0);
  const [width,setWidth] = useState(0);

  // If there is only 1 variant, preselect the options
  useEffect(() => {
    if (product.variants?.length === 1) {
      const variantOptions = optionsAsKeymap(product.variants[0].options)
      setOptions(variantOptions ?? {})
    }
  }, [product.variants])

  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) {
      return
    }

    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  // update the options when a variant is selected
  const setOptionValue = (optionId: string, value: string) => {
    setOptions((prev) => ({
      ...prev,
      [optionId]: value,
    }))
  }

  //check if the selected options produce a valid variant
  const isValidVariant = useMemo(() => {
    return product.variants?.some((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  // check if the selected variant is in stock
  const inStock = useMemo(() => {
    // If we don't manage inventory, we can always add to cart
    if (selectedVariant && !selectedVariant.manage_inventory) {
      return true
    }

    // If we allow back orders on the variant, we can add to cart
    if (selectedVariant?.allow_backorder) {
      return true
    }

    // If there is inventory available, we can add to cart
    if (
      selectedVariant?.manage_inventory &&
      (selectedVariant?.inventory_quantity || 0) > 0
    ) {
      return true
    }

    // Otherwise, we can't add to cart
    return false
  }, [selectedVariant])

  const actionsRef = useRef<HTMLDivElement>(null)

  const inView = useIntersection(actionsRef, "0px")

  // add the selected variant to the cart
  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return null

    setIsAdding(true)

    await addToCart({
      variantId: selectedVariant.id,
      quantity: 1,
      countryCode,
      metadata: {
        width,
        height,
      },
    })

    setIsAdding(false)
  }

  const drawImageOnCanvas = async (imageSrc: string) =>
   {
    const preview = canvasRef.current;
    if(!preview) return;

    const context = preview.getContext("2d");
    if(!context) return;

    try{
      
      const img = await loadImage(imageSrc);
      context.clearRect(0,0, preview.width, preview.height);
      context.drawImage(img, 0,0,preview.width, preview.height);
      console.log("Bild erfolgreich auf Canvas gezeichnet.");
    }catch(e){
      console.error("Fehler beim Laden oder Zeichnen des Bildes.", e);

    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
  {
    if(e.target.files && e.target.files[0])
    {
      const file = e.target.files[0];   
      const reader = new FileReader();
      reader.onload = (e) =>
      {
        const result = e.target?.result as string;
        if(result)
        {
          setUploadedImageData(result);
          drawImageOnCanvas(e.target?.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  }

  useEffect(()=>{
    if(uploadedImageData)
    {
      const apiEndpoint = "/store/upload";

      fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: uploadedImageData,
          product_id: product.id,
        }),
      })
      .then(response =>{
        if(!response.ok)
        {
          throw new Error(`Fehler beim Hochladen des Bildes: ${response.status}`);
        }
        return response.json();
      })
      .then(data =>{
        console.log("Upload erfolgreich:", data);
      })
      .catch(error =>{
        console.error("Fehler:", error);
      });
    }
  }, [uploadedImageData, product.id]);


  return (
    <>
      <div className="flex flex-col gap-y-2" ref={actionsRef}>
        <div>
          {(product.variants?.length ?? 0) > 1 && (
            <div className="flex flex-col gap-y-4">
              {(product.options || []).map((option) => {
                return (
                  <div key={option.id}>
                    <OptionSelect
                      option={option}
                      current={options[option.id]}
                      updateOption={setOptionValue}
                      title={option.title ?? ""}
                      data-testid="product-options"
                      disabled={!!disabled || isAdding}
                    />
                  </div>
                )
              })}
              <Divider />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-y-2">
        {!!product.metadata?.is_personalized && (
          <div className="flex flex-col gap-y-3">
            <span className="text-sm">Enter Dimensions</span>
            <div className="flex gap-3">
              <Input
                name="width"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                label="Width (cm)"
                type="number"
                min={0}
              />
              <Input
                name="height"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                label="Height (cm)"
                type="number"
                min={0}
              />

            </div>

          </div>

        )}

      </div>

        <ProductPrice product={product} variant={selectedVariant} region={region} metadata={{width,height}}/>

        {product.metadata?.is_printOnDemand === true && (
          <>
          <canvas ref={canvasRef} width="50" height="50" className="border border-gray-300 mt-4 mb-2"/>
          <input type="file" id="upload-image" accept="image/*" className="hidden" onChange={handleChange} ref={fileInputRef}/>
          <label htmlFor="upload-image" className="w-full">
            <Button className="w-full" onClick={handleUploadClick}>Upload Graphic</Button>
          </label>
          </>
        )}

        <Button
          onClick={handleAddToCart}
          disabled={
            !inStock ||
            !selectedVariant ||
            !!disabled ||
            isAdding ||
            !isValidVariant ||
            (!!product.metadata?.is_personalized && (!width || !height))
          }
          variant="primary"
          className="w-full h-10 bg-orange-950 hover:bg-orange-900"
          isLoading={isAdding}
          data-testid="add-product-button"
        >
          {!selectedVariant && !options
            ? "Ausgewählte Variante"
            : !inStock || !isValidVariant
            ? "Ausverkauft"
            : "Zum Warenkorb hinzufügen"}
        </Button>
        <MobileActions
          product={product}
          variant={selectedVariant}
          options={options}
          updateOptions={setOptionValue}
          inStock={inStock}
          handleAddToCart={handleAddToCart}
          isAdding={isAdding}
          show={!inView}
          optionsDisabled={!!disabled || isAdding}
        />
      </div>
    </>
  )
}
