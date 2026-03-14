import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "SHOP_REDACT":
      await db.message.deleteMany({ where: { conversation: { shop } } });
      await db.conversation.deleteMany({ where: { shop } });
      await db.chatSettings.deleteMany({ where: { shop } });
      await db.bundleComponent.deleteMany({
        where: { bundle: { shop } },
      });
      await db.bundle.deleteMany({ where: { shop } });
      await db.appSettings.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      break;
    case "CUSTOMERS_DATA_REQUEST":
      // Chat conversations may contain customer emails
      break;
    case "CUSTOMERS_REDACT":
      // Anonymize customer data in conversations
      await db.conversation.updateMany({
        where: { shop, customerEmail: { not: null } },
        data: { customerEmail: null, customerName: null },
      });
      break;
  }

  return new Response();
};
