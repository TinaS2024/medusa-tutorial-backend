import { Button, FocusModal, Heading, Input, Label, Select, toast, } from "@medusajs/ui";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sdk } from "../lib/sdk";
import { HttpTypes } from "@medusajs/framework/types";
import { getClientLanguage } from "../lib/i18n";
import { getMessages, type Lang, type Messages } from "../lib/messages";

type BundleTexts = Messages["bundled_products"]


const CreateBundledProduct = () =>
{
    const [lang, setLang] = useState<Lang>("de");
    const t = getMessages(lang).bundled_products;

    useEffect(() => {
        setLang(getClientLanguage());
    }, []);


    const [open, setOpen ] = useState(false);
    const [title, setTitle ] = useState("");
    const [items, setItems ] = useState<{
        product_id: string | undefined
        quantity: number
    }[]>([
        {
            product_id: undefined,
            quantity: 1,
        },
    ]);
    const [products, setProducts] = useState<HttpTypes.AdminProduct[]>([])
    const productsLimit = 15;
    const [currentProductPage, setCurrentProductPage] = useState(0);
    const [productsCount, setProductsCount] = useState(0);
    const hasNextPage = useMemo(() => {
        return productsCount === 0 ? true : products.length < productsCount
        }, [products.length, productsCount]);

    const queryClient = useQueryClient();

    useQuery({ queryKey: ["products", currentProductPage],
    queryFn: async () => {

    const { products, count } = await sdk.admin.product.list({
        limit: productsLimit,
        offset: currentProductPage * productsLimit,
    })
    setProductsCount(count);
        setProducts((prev) => {
      const known = new Set(prev.map((p) => p.id))
      return [...prev, ...products.filter((p) => !known.has(p.id))]
    });
    return products;
  },
    enabled: hasNextPage,
})


    const fetchMoreProducts = useCallback(() => {
      if (!hasNextPage) {
            return
        }

    setCurrentProductPage((page) => page + 1)
}, [hasNextPage])


    const { mutateAsync: createBundledProduct, isPending: isCreating } = useMutation({
        mutationFn: async (data: Record<string, any>) => {
            await sdk.client.fetch("/admin/bundled-products", {
            method: "POST",
            body: data,
            })
        },
    })


    const handleCreate = async () => {

      if(!title.trim())
      {
        toast.error(t.error_title_empty);
        return;
      }

      const hasUndefinedProductId = items.some(item => item.product_id == undefined);
      if(hasUndefinedProductId)
      {
        toast.error(t.error_item_product);
        return;
      }

        try {
            await createBundledProduct({
            title,
            product: {
                title,
                options: [
                    {
                        title: "Default",
                        values: ["default"],
                    },
                  ],
                status: "published",
                variants: [
                    {
                        title,
                        prices: [],
                        options: {
                            Default: "default",
                        },
                        manage_inventory:false,
                    },
                        ],
                      },
            items: items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                })),
    })

    setOpen(false);
    toast.success(t.created);

    queryClient.invalidateQueries({
      queryKey: ["bundled-products"],
    })
    setTitle("");
    setItems([{ product_id: undefined, quantity: 1 }]);
  } catch (error) {

    toast.error(t.create_failed);

  }
}

return(
    <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Trigger asChild>
            <Button variant="primary">{t.create}</Button>
        </FocusModal.Trigger>
        <FocusModal.Content>
            <FocusModal.Header>
                <div className="flex items-center justify-end gap-x-2">
                    <Heading level={"h1"}>{t.drawer_title}</Heading>
                </div>
            </FocusModal.Header>
            <FocusModal.Body>
                <div className="flex flex-1 flex-col items-center overflow-y-auto">
                    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-y-8 px-2 py-16">
                        <div>
                            <Label>{t.bundle_title}</Label>
                            <Input value={title} onChange={(e)=>setTitle(e.target.value)}/>

                        </div>
                        <div>
                            <Heading level={"h2"}>{t.items}</Heading>
                            {items.map((item,index) =>
                            (
                                <BundledProductItem key={index} item={item} index={index} setItems={setItems} products={products} fetchMoreProducts={fetchMoreProducts} hasNextPage={hasNextPage} t={t}/>
                            ))

                            }
                            <Button variant="secondary" onClick={()=>setItems([
                                ...items, {
                                    product_id: undefined, 
                                    quantity:1
                                },
                            ])}>{t.add_item}</Button>
                        </div>
                    </div>
                </div>
            </FocusModal.Body>
            <FocusModal.Footer>
                <div className="flex items-center justify-end gap-x-2">
                    <Button variant="secondary" onClick={() =>setOpen(false)}>{t.cancel}</Button>
                    <Button variant="primary" onClick={handleCreate} isLoading={isCreating}>{t.submit}</Button>
                </div>
            </FocusModal.Footer>
        </FocusModal.Content>
    </FocusModal>
)
}

export default CreateBundledProduct;


type BundledProductItemProps = {
    item: { 
        product_id: string | undefined, 
        quantity: number, 
        }
    index: number
    setItems: React.Dispatch<React.SetStateAction<{
    product_id: string | undefined;
    quantity: number;
    }[]>>
    products: HttpTypes.AdminProduct[] | undefined
    fetchMoreProducts: () => void
    hasNextPage: boolean
    t: BundleTexts
}


const BundledProductItem = ({ item, index, setItems, products, fetchMoreProducts, hasNextPage, t}: BundledProductItemProps) => {

const observer = useRef<IntersectionObserver | null>(null)

const lastOptionRef = useCallback((node: HTMLDivElement | null) => {

      observer.current?.disconnect()

      if (!node || !hasNextPage) 
      {
        return
      }

      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) 
          {
            fetchMoreProducts()
          }
        },
        { threshold: 1 }
      )

      observer.current.observe(node)
    },

    [hasNextPage, fetchMoreProducts]
  )

  return (
    <div className="my-2">
      <Heading level={"h3"} className="mb-2">{t.item.replace("{index}", String(index + 1))}</Heading>
        <Select value={item.product_id} onValueChange={(value) => 
            setItems((items) => 
                items.map((item, i) => {
                    return i === index 
                  ? { ...item, product_id: value, } : item
              })
            )
          }
        >

          <Select.Trigger>
            <Select.Value placeholder={t.select_product} />
          </Select.Trigger>
          <Select.Content>
            {products?.map((product, productIndex) => (
              <Select.Item key={product.id} value={product.id} ref={
                  productIndex === products.length - 1 ? lastOptionRef : null }>
                {product.title}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <div className="flex items-center gap-x-2 [&_div]:flex-1">
          <Label>{t.quantity}</Label>
          <Input type="number" placeholder={t.quantity_placeholder}className="w-full mt-1 rounded-md border border-gray-200 p-2" value={item.quantity} onChange={(e) => 
            setItems((items) => 
                items.map((item, i) => {
                  return i === index ? { ...item, quantity: parseInt(e.target.value) } : item }))
                    }/>
        </div>
    </div>
  )

}

