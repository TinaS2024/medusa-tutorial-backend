import { MedusaService } from "@medusajs/framework/utils";
import { NewsletterSubscriber } from "./models/subscriber";

export default class NewsletterModuleService extends MedusaService({
  NewsletterSubscriber,
}) {}
