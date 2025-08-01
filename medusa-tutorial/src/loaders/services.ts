import { MedusaContainer } from "@medusajs/framework/types";
import MeinPluginService from "../services/mein-service";

export default async (container: MedusaContainer): Promise<void> => {
    try{
        const MeinPluginService = container.resolve<MeinPluginService>("meinPluginService");
        console.log(`MeinPluginService ${MeinPluginService} wurde erfolgreich registriert`);

    }catch(error)
    {
        console.error("Fehler beim Registrieren von MeinPluginService:", error)

    }
} 