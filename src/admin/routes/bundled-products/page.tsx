import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Container, Heading, DataTable, useDataTable, createDataTableColumnHelper, DataTablePaginationState, } from "@medusajs/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { sdk } from "../../lib/sdk";
import { Link } from "react-router-dom";
import CreateBundledProduct from "../../components/create-bundled-product";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang, type Messages } from "../../lib/messages";

type BundleTexts = Messages["bundled_products"]


type BundledProduct = {
    id: string
    title: string
    product: {
        id: string
        }
    items: {
        id: string
        product: {
            id: string
            title: string
            }
        quantity: number
            }[]
    created_at: Date
    updated_at: Date
}

const columnHelper = createDataTableColumnHelper<BundledProduct>()

const getColumns = (t: BundleTexts) =>[columnHelper.accessor("id", { header: "ID", }),

  columnHelper.accessor("title", { header: t.col_title, }),

  columnHelper.accessor("items", { header: t.col_items,

    cell: ({ row }) => {

      return row.original.items.map((item) => (

        <div key={item.id}>
          <Link to={`/products/${item.product.id}`}>
            {item.product.title}
          </Link>{" "}
          x {item.quantity}
        </div>
      ))
    },
  }),
  columnHelper.accessor("product", {header: t.col_product,

    cell: ({ row }) => {

      return (
        <Link to={`/products/${row.original.product?.id}`}>
          {t.view_product}
        </Link>
      )
    },
  }),
]

const limit = 15;


const BundledProductsPage = () => {

  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang).bundled_products;

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

   const columns = useMemo(() => getColumns(t), [lang]);

  const [pagination, setPagination] = useState<DataTablePaginationState>({ pageSize: limit, pageIndex: 0,})
  const offset = useMemo(() => {
        return pagination.pageIndex * pagination.pageSize

        }, [pagination])

  const { data, isLoading } = useQuery<{
    bundled_products: BundledProduct[]
    count: number
    }>({
    queryKey: ["bundled-products", offset, limit],
    queryFn: () => sdk.client.fetch("/admin/bundled-products", {
    method: "GET",
    query: {
        limit,
        offset,
        expand: "product,items.product",
      },
    }),
  })


  const table = useDataTable({
    columns,
    data: data?.bundled_products ?? [],
    isLoading,
    pagination: {
        state: pagination,
      onPaginationChange: setPagination,
        },
    rowCount: data?.count ?? 0,
  })


  return (
  <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex items-start justify-between gap-2 md:flex-row md:items-center">
          <Heading>{t.title}</Heading>
            <CreateBundledProduct />
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
    label: getMessages(getClientLanguage()).bundled_products.menu,
    icon: CubeSolid,
    })

export default BundledProductsPage;