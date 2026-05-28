import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export const GET = async(req: MedusaRequest, res: MedusaResponse) =>
{

    const auth = req.scope.resolve("auth") as { actor_id?: string };
    const customerId = auth.actor_id;

    if (!customerId) 
    {
    return res.status(401).json({ message: "Nicht autorisiert" });
    }

    try{

    return res.json({
      customer_id: customerId,
      designs: [] 
    })

    }catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ message: "Fehler beim Laden", error: message });
    }
}

export const POST = async(req: MedusaRequest, res: MedusaResponse) =>
{
    const auth = req.scope.resolve("auth") as { actor_id?: string };
    const customerId = auth.actor_id;

    const { title, designData } = req.body as { title?: string; designData?: string };

    if (!customerId) 
    {
        return res.status(401).json({ message: "Nicht autorisiert" });
    }

    if (typeof designData !== "string" || designData.trim().length === 0)
    {
        return res.status(400).json({ message: "Keine gültigen Designdaten übergeben." });
    }

    const safeTitle = typeof title === "string" && title.trim().length > 0 ? title.trim() : "design";

    try{
    
        const fileService = req.scope.resolve("fileService");
        const base64Data = designData.startsWith("data:")
          ? designData.replace(/^data:image\/\w+;base64,/, "")
          : designData;
        const fileBuffer = Buffer.from(base64Data, "base64");

        const fileUpload = await (fileService as any).upload({
        filename: `${safeTitle.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.png`,
        file: fileBuffer,
        mimeType: "image/png"
        })
    
        return res.status(201).json({
        message: "Design erfolgreich gespeichert und hochgeladen",
        customer_id: customerId,
        file_url: fileUpload.url 
        })
    

    }catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ 
        message: "Fehler beim Verarbeiten des Designs", 
        error: message 
    })
    }
}