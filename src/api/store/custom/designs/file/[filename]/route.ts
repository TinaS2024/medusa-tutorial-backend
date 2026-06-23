import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { promises as fs } from "fs";
import { join } from "path";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => 
{
  const auth = req.scope.resolve("auth") as { actor_id?: string };
  const customerId = auth.actor_id;
  const { filename } = req.params;


  if (!customerId) 
  {
    return res.status(401).json({ message: "Nicht autorisiert" });
  }


  if (!filename.startsWith(customerId)) 
  {   
    return res.status(403).json({ message: "Zugriff verweigert. Das ist nicht dein Design." });
  }

  try {
    const filePath = join(process.cwd(), "uploads", "customer_designs", filename);
    const fileBuffer = await fs.readFile(filePath);

    const contentType = filename.endsWith(".svg") ? "image/svg+xml" : "image/png";

    res.setHeader("Content-Type", contentType);
    return res.send(fileBuffer);

  } catch (error) 
  {
    return res.status(404).json({ message: "Datei nicht gefunden" });
  }
}