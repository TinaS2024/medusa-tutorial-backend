import { model } from "@medusajs/framework/utils";

export const CustomerDesign = model.define("customer_design", 
    {
        id: model.id({prefix: "custdes"}),
        title: model.text(),

        png_url: model.text(),
        png_key: model.text().nullable(),

        svg_url: model.text(),
        svg_key: model.text().nullable(),
        
        customer_id: model.text(),
    }
)