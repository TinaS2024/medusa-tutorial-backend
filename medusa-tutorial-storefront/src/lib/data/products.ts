"use server"

import { sdk } from "@lib/config"
import { sortProducts } from "@lib/util/sort-products"
import { HttpTypes } from "@medusajs/types"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import { getRegion, retrieveRegion } from "./regions"


export const listProducts = async ({
  pageParam = 1,
  queryParams,
  countryCode,
  regionId,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  countryCode?: string
  regionId?: string
}): Promise<{
  response: { products: (HttpTypes.StoreProduct & {
  bundle?: Omit<BundleProduct, "items">
  })[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> => {
  if (!countryCode && !regionId) {
    throw new Error("Country code or region ID is required")
  }

  const limit = queryParams?.limit || 12
  const _pageParam = Math.max(pageParam, 1)
  const offset = (_pageParam === 1) ? 0 : (_pageParam - 1) * limit;

  let region: HttpTypes.StoreRegion | undefined | null

  if (countryCode) {
    region = await getRegion(countryCode)
  } else {
    region = await retrieveRegion(regionId!)
  }

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("products")),
  }

  return sdk.client
    .fetch<{ products: (HttpTypes.StoreProduct & { bundle?: Omit<BundleProduct, "items" >})[]; count: number }>(
      `/store/products`,
      {
        method: "GET",
        query: {
          limit,
          offset,
          region_id: region?.id,
          fields:
            "*variants.calculated_price,+variants.inventory_quantity,+metadata,+tags",
          ...queryParams,
        },
        headers,
        next,
        cache: "force-cache",
      }
    )
    .then(({ products, count }) => {
      const nextPage = count > offset + limit ? pageParam + 1 : null

      return {
        response: {
          products,
          count,
        },
        nextPage: nextPage,
        queryParams,
      }
    })
}

/**
 * This will fetch 100 products to the Next.js cache and sort them based on the sortBy parameter.
 * It will then return the paginated products based on the page and limit parameters.
 */
export const listProductsWithSort = async ({
  page = 0,
  queryParams,
  sortBy = "created_at",
  countryCode,
}: {
  page?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  sortBy?: SortOptions
  countryCode: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> => {
  const limit = queryParams?.limit || 12

  const {
    response: { products, count },
  } = await listProducts({
    pageParam: 0,
    queryParams: {
      ...queryParams,
      limit: 100,
    },
    countryCode,
  })

  const sortedProducts = sortProducts(products, sortBy)

  const pageParam = (page - 1) * limit

  const nextPage = count > pageParam + limit ? pageParam + limit : null

  const paginatedProducts = sortedProducts.slice(pageParam, pageParam + limit)

  return {
    response: {
      products: paginatedProducts,
      count,
    },
    nextPage,
    queryParams,
  }
}

export const listBundles = async ({
  pageParam = 1,
  queryParams,
  countryCode,
  regionId,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  countryCode?: string
  regionId?: string
}): Promise<{
  response: { products: BundleProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> => {
  if (!countryCode && !regionId) {
    throw new Error("Country code or region ID is required")
  }

  const limit = queryParams?.limit || 12
  const _pageParam = Math.max(pageParam, 1)
  const offset = (_pageParam === 1) ? 0 : (_pageParam - 1) * limit;

  let region: HttpTypes.StoreRegion | undefined | null

  if (countryCode) {
    region = await getRegion(countryCode)
  } else {
    region = await retrieveRegion(regionId!)
  }

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("bundles")),
  }

  return sdk.client
    .fetch<{ bundle_products: BundleProduct[]; count: number }>(
      `/store/bundle-products`,
      {
        method: "GET",
        query: {
          limit,
          offset,
          region_id: region?.id,
          ...queryParams,
        },
        headers,
        next,
        cache: "force-cache",
      }
    )
    .then(({ bundle_products, count }) => {
      const nextPage = count > offset + limit ? pageParam + 1 : null

      return {
        response: {
          products: bundle_products,
          count,
        },
        nextPage: nextPage,
        queryParams,
      }
    })
}

export type BundleProduct = {
  id: string
  title: string
  product: {
    id: string
    thumbnail: string
    title: string
    handle: string
  }

  items: {
    id: string
    title: string
    product: HttpTypes.StoreProduct
  }[]
}


export const getBundleProduct = async (id: string, {
  currency_code,
  region_id,
}: {
    currency_code?: string
    region_id?: string
}) => {

  const headers = {...(await getAuthHeaders()),}


  return sdk.client.fetch<{bundle_product: BundleProduct}>(`/store/bundle-products/${id}`, {

    method: "GET",
    headers,
    query: {
      currency_code,
      region_id,
    },
  })
}

export const getCustomVariantPrice = async ({ 
  variant_id,
   region_id, 
   metadata,
  }: {
    variant_id: string,
    region_id: string,
    metadata?: Record<string, any>
  }) =>
  {
    const headers = {...(await getAuthHeaders()),}

    return sdk.client.fetch<{price: number}>(`/store/variants/${variant_id}/price`,
      {
        method: "POST",
        body: {
          region_id,
          metadata,
        },
        headers,
        cache: "no-cache",
      }
    ).then(({price}) => price)
  }

  