"use client"

import { addBundleToCart } from "@lib/data/cart";
import { HttpTypes } from "@medusajs/types";
import { Button } from "@medusajs/ui";
import OptionSelect from "@modules/products/components/product-actions/option-select";
import { BundleProduct } from "@lib/data/products";
import { isEqual } from "lodash";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ProductPrice from "../product-price";
import Thumbnail from "../thumbnail";


type BundleActionsProps = {
    bundle: BundleProduct
    }


const optionsAsKeymap = (variantOptions: HttpTypes.StoreProductVariant["options"]) => 
    {
        return variantOptions?.reduce((acc: Record<string, string>, varopt: any) => {
        acc[varopt.option_id] = varopt.value
            return acc
        }, {})
    }


export default function BundleActions({bundle,}: BundleActionsProps) {

  const [productOptions, setProductOptions] = useState<Record<string, Record<string, string>>>({})

  const [isAdding, setIsAdding] = useState(false)

  const countryCode = useParams().countryCode as string

    // For each product, if it has only 1 variant, preselect it

    useEffect(() => {
        const initialOptions: Record<string, Record<string, string>> = {}
        bundle.items.forEach((item) => {
            if (item.product.variants?.length === 1) {
                const variantOptions = optionsAsKeymap(item.product.variants[0].options)
                initialOptions[item.product.id] = variantOptions ?? {}

            } else {
                initialOptions[item.product.id] = {}
            }
        })
        setProductOptions(initialOptions)
    }, [bundle.items])


        const selectedVariants = useMemo(() => {
            return bundle.items.map((item) => {
                if (!item.product.variants || item.product.variants.length === 0) {return undefined}
                return item.product.variants.find((v) => {

        const variantOptions = optionsAsKeymap(v.options)
        return isEqual(variantOptions, productOptions[item.product.id])
        })

         })

        }, [bundle.items, productOptions])


        const setOptionValue = (productId: string, optionId: string, value: string) => {
            setProductOptions((prev) => ({...prev,[productId]: {
                ...prev[productId],
                [optionId]: value,
            },
        }))
    }

        const allVariantsSelected = useMemo(() => {
            return selectedVariants.every((v) => v !== undefined)
        }, [selectedVariants])

        const handleAddToCart = async () => {
            if (!allVariantsSelected) {return}
            setIsAdding(true)
            await addBundleToCart({
                bundleId: bundle.id,
                quantity: 1,
                countryCode,
                items: bundle.items.map((item, index) => ({
                    item_id: item.id,
                    variant_id: selectedVariants[index]?.id ?? "",
                })),
            })
            setIsAdding(false);
        }

    return(
    <div className="flex flex-col gap-y-6 max-w-2xl mx-auto w-full">
    <h2 className="text-2xl">Items in Bundle</h2>
    <div className="grid gap-6">
        {bundle.items.map((item, index) => (
        <div key={item.product.id} className="rounded-lg p-6 shadow-elevation-card-rest hover:shadow-elevation-card-hover transition-shadow bg-white">
          <div className="flex items-start gap-4">
            <Thumbnail thumbnail={item.product.thumbnail} className="w-24 h-24 rounded-md" size="square" images={[]}/>
            <div>
              <h3 className="text-lg">{item.product.title}</h3>
              <ProductPrice product={item.product} variant={selectedVariants[index]} className="!text-sm mt-2 text-ui-fg-muted"/>
            </div>
          </div>
          {(item.product.variants?.length ?? 0) > 1 && (
            <div className="space-y-4 mt-4">
              {(item.product.options || []).map((option) => (
                <div key={option.id}>
                  <OptionSelect option={option} current={productOptions[item.product.id]?.[option.id]} updateOption={(optionId, value) => setOptionValue(item.product.id, optionId, value)}
                    title={option.title ?? ""} disabled={isAdding}/>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
    <Button onClick={handleAddToCart} disabled={!allVariantsSelected || isAdding} variant="primary" className="w-full h-10" isLoading={isAdding}>
      {!allVariantsSelected ? "Select all variants" : "Add bundle to cart"}
    </Button>
  </div>
    )
}