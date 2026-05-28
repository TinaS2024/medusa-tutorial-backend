import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CustomerDesign } from "../../../../models/customer-design";
import { promises as fs } from "fs";
import { join } from "path";

interface DesignRequestBody {
  title: string
  pngData: string
  svgData: string
}

export const POST = async(req: MedusaRequest, res: MedusaResponse) =>
{
    const auth = req.scope.resolve("auth") as { actor_id?: string };
    const customerId = auth.actor_id;

    if (!customerId) 
    {
        return res.status(401).json({ message: "Nicht autorisiert" });
    }

    const { title, pngData, svgData } = req.body as DesignRequestBody;

    if (!pngData || !svgData) 
    {
    return res.status(400).json({ message: "PNG und SVG sind erforderlich." })
  }

    
    const safeTitle = typeof title === "string" && title.trim().length > 0 ? title.trim() : "design"
    const timestamp = Date.now()
    const sanitizedTitle = safeTitle.toLowerCase().replace(/\s+/g, "-")

    try{
        const uploadDir = join(process.cwd(), "public", "uploads", "customer_designs");

        await fs.mkdir(uploadDir, { recursive: true });

        const pngFilename = `${customerId}_${sanitizedTitle}_${timestamp}.png`;
        const svgFilename = `${customerId}_${sanitizedTitle}_${timestamp}.svg`;

        const cleanPng = pngData.startsWith("data:") ? pngData.replace(/^data:image\/\w+;base64,/, "") : pngData;
        const pngBuffer = Buffer.from(cleanPng, "base64");
        await fs.writeFile(join(uploadDir, pngFilename), pngBuffer);

        let svgBuffer: Buffer;
        if (svgData.startsWith("data:image/svg+xml;base64,"))
        {
        const cleanSvg = svgData.replace(/^data:image\/svg\+xml;base64,/, "");
        svgBuffer = Buffer.from(cleanSvg, "base64");
        } else {
            svgBuffer = Buffer.from(svgData, "utf-8");
        }
        await fs.writeFile(join(uploadDir, svgFilename), svgBuffer);

        const entityManager = req.scope.resolve("manager") as any;
    
        await entityManager.transactional(async (manager: any) => {

        await manager.insert(CustomerDesign as any, {
        title: safeTitle,
        png_url: `/store/custom/designs/file/${pngFilename}`,
        png_key: pngFilename,
        svg_url: `/store/custom/designs/file/${svgFilename}`, 
        svg_key: svgFilename,
        customer_id: customerId
    });
    })

    return res.status(201).json({
      message: "Design lokal im Backend gespeichert",
      customer_id: customerId
    })
    
    }catch (error) {
    console.error("🚨 KRITISCHER FEHLER IM MEDUSA-ENDPOINT:", error);
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ 
      message: "Fehler beim lokalen Speichern", 
      error: message,
      stack: error instanceof Error ? error.stack : undefined 
    })
  }
}