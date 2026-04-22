import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Readable } from "stream";

interface UploadRequestBody {
  data: string;
  product_id: string;
}

export default async (req: MedusaRequest, res: MedusaResponse) => {
  try {

    const { data: base64Data, product_id } = req.body as UploadRequestBody;

    if (!base64Data || !product_id) {
      return res.status(400).json({ message: "Fehlende Daten: base64-Daten oder Produkt-ID fehlen." });
    }


    const base64Image = base64Data.split(';base64,').pop();
    if (!base64Image) {
        return res.status(400).json({ message: "Ungültiges Base64-Format." });
    }


    const buffer = Buffer.from(base64Image, 'base64');
    

    const fileStream = Readable.from([buffer]);

    const fileService = req.scope.resolve("fileService");


    const uploadedFile = await (fileService as any).upload(fileStream, {
      name: `custom-image-${product_id}.png`, 
      mimeType: "image/png",
    });



    res.status(200).json({
      message: "Image successfully uploaded and stored.",
      url: uploadedFile.url,
    });

  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};