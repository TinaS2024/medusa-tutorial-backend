import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { randomUUID } from "crypto";

interface DesignRequestBody {
  customerId: string
  title?: string
  design_image: string
  variant_id?: string
  country_code?: string
  width?: number
  height?: number
  thickness?: number
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    customerId,
    title,
    design_image,
    variant_id,
    country_code,
    width,
    height,
    thickness,
  } = req.body as DesignRequestBody;

  if (!customerId || customerId === "guest") {
    return res.status(400).json({ message: "customerId fehlt oder ist ein Gast." });
  }

  if (!design_image) {
    return res.status(400).json({ message: "design_image ist erforderlich." });
  }

  try {
    const customerModuleService = req.scope.resolve(Modules.CUSTOMER);
    const customer = await customerModuleService.retrieveCustomer(customerId);

    const existingMetadata =
      customer.metadata && typeof customer.metadata === "object"
        ? (customer.metadata as Record<string, any>)
        : {};

    const existingDesigns = Array.isArray(existingMetadata.designs)
      ? existingMetadata.designs
      : [];

    const isDuplicate = existingDesigns.some(
      (d: any) => d && d.design_image === design_image
    );

    if (isDuplicate) {
      return res.status(200).json({ message: "Design bereits vorhanden.", customer_id: customerId });
    }

    const nextDesign = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      title: title ?? null,
      variant_id: variant_id ?? null,
      country_code: country_code ?? null,
      design_image,
      width,
      height,
      thickness,
    };

    const designs = [nextDesign, ...existingDesigns].slice(0, 50);

    await customerModuleService.updateCustomers(
      { id: customerId },
      { metadata: { ...existingMetadata, designs } }
    );

    return res.status(201).json({ message: "Design im Kundenkonto gespeichert.", customer_id: customerId });
  } catch (error) {
    console.error("🚨 Fehler beim Speichern des Designs in Metadaten:", error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: "Fehler beim Speichern", error: message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb", 
    },
  },
}