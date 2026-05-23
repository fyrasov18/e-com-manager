import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  if (!process.env.SMTP_USER) {
    console.warn("[Email] SMTP not configured, skipping email:", subject);
    return { success: true, skipped: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"Jody Shop" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log("[Email] Sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[Email] Failed:", error);
    return { success: false, error };
  }
}

const baseStyles = `
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #FAF8F5;
  margin: 0;
  padding: 0;
`;

const containerStyles = `
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 20px;
`;

const headerStyles = `
  background: #1A1A1A;
  padding: 32px 24px;
  text-align: center;
  border-radius: 12px 12px 0 0;
`;

const logoStyles = `
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 28px;
  font-weight: 700;
  color: #FAF8F5;
  letter-spacing: -0.02em;
`;

const contentStyles = `
  background: white;
  padding: 40px 32px;
  border-radius: 0 0 12px 12px;
  border: 1px solid #E8E4DC;
  border-top: none;
`;

const titleStyles = `
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 24px;
  font-weight: 700;
  color: #1A1A1A;
  margin: 0 0 16px;
  letter-spacing: -0.02em;
`;

const textStyles = `
  font-size: 15px;
  line-height: 1.7;
  color: #555;
  margin: 0 0 16px;
`;

const buttonStyles = `
  display: inline-block;
  background: #D85A30;
  color: white;
  padding: 14px 32px;
  border-radius: 6px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin: 16px 0;
`;

const dividerStyles = `
  border: none;
  border-top: 1px solid #E8E4DC;
  margin: 24px 0;
`;

const footerStyles = `
  font-size: 13px;
  color: #999;
  text-align: center;
  margin-top: 32px;
  line-height: 1.6;
`;

function emailTemplate(content: string, footer?: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jody Shop</title>
</head>
<body style="${baseStyles}">
  <div style="${containerStyles}">
    <div style="${headerStyles}">
      <span style="${logoStyles}">JODY<span style="color: #D85A30">.</span></span>
    </div>
    <div style="${contentStyles}">
      ${content}
    </div>
    ${footer ?? `<div style="${footerStyles}">
      <p>Jody Shop — Tunis, Tunisie</p>
      <p style="margin-top: 8px;">
        Cet email a été envoyé automatiquement. Merci de ne pas y répondre.
      </p>
    </div>`}
  </div>
</body>
</html>
`;
}

export async function sendOrderConfirmation(params: {
  to: string;
  orderRef: string;
  customerName: string;
  total: number;
  items: { name: string; quantity: number; price: number }[];
}) {
  const itemsHtml = params.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #E8E4DC;">${item.name}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E8E4DC; text-align: center;">×${item.quantity}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E8E4DC; text-align: right; font-weight: 600;">${item.price.toFixed(0)} TND</td>
    </tr>
  `
    )
    .join("");

  const content = `
    <h1 style="${titleStyles}">Commande confirmée ✓</h1>
    <p style="${textStyles}">
      Bonjour <strong>${params.customerName}</strong>,
    </p>
    <p style="${textStyles}">
      Nous avons bien reçu votre commande <strong>#${params.orderRef}</strong> et nous la préparons avec soin.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;">Produit</th>
          <th style="text-align: center; padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;">Qté</th>
          <th style="text-align: right; padding: 8px 0; color: #999; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;">Prix</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding: 16px 0 0; text-align: right; font-weight: 700; font-size: 16px;">Total</td>
          <td style="padding: 16px 0 0; text-align: right; font-weight: 700; font-size: 16px; color: #D85A30;">${params.total.toFixed(0)} TND</td>
        </tr>
      </tfoot>
    </table>
    <p style="${textStyles}">
      Vous recevrez un email avec le numéro de suivi dès que votre colis sera expédié.
    </p>
  `;

  return sendEmail({
    to: params.to,
    subject: `Commande #${params.orderRef} — Confirmée`,
    html: emailTemplate(content),
  });
}

export async function sendShipmentNotification(params: {
  to: string;
  orderRef: string;
  customerName: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery?: string;
}) {
  const trackingUrl =
    params.carrier.toLowerCase().includes("colissimo")
      ? `https://delivery.colissimo.com.tn/tracking/${params.trackingNumber}`
      : "#";

  const content = `
    <h1 style="${titleStyles}">Votre colis est en route ✈️</h1>
    <p style="${textStyles}">
      Bonjour <strong>${params.customerName}</strong>,
    </p>
    <p style="${textStyles}">
      Bonne nouvelle ! Votre commande <strong>#${params.orderRef}</strong> a été expédiée.
    </p>
    <div style="background: #F5EDE0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="font-size: 13px; color: #999; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.1em;">
        Numéro de suivi
      </p>
      <p style="font-family: monospace; font-size: 18px; font-weight: 700; color: #1A1A1A; margin: 0;">
        ${params.trackingNumber}
      </p>
    </div>
    ${
      params.estimatedDelivery
        ? `
    <p style="${textStyles}">
      Date de livraison estimée : <strong>${params.estimatedDelivery}</strong>
    </p>
    `
        : ""
    }
    <a href="${trackingUrl}" style="${buttonStyles}">
      Suivre mon colis →
    </a>
  `;

  return sendEmail({
    to: params.to,
    subject: `Commande #${params.orderRef} — Expédiée`,
    html: emailTemplate(content),
  });
}

export async function sendDeliveryNotification(params: {
  to: string;
  orderRef: string;
  customerName: string;
}) {
  const content = `
    <h1 style="${titleStyles}">Colis livré ! 🎉</h1>
    <p style="${textStyles}">
      Bonjour <strong>${params.customerName}</strong>,
    </p>
    <p style="${textStyles}">
      Votre commande <strong>#${params.orderRef}</strong> a été livrée. Nous espérons que vous l'apprécierez !
    </p>
    <p style="${textStyles}">
      N'hésitez pas à nous laisser un avis — c'est très important pour nous 💜
    </p>
    <a href="https://jodyshop.tn/avis" style="${buttonStyles}">
      Donner mon avis →
    </a>
  `;

  return sendEmail({
    to: params.to,
    subject: `Commande #${params.orderRef} — Livrée`,
    html: emailTemplate(content),
  });
}

export async function sendStockAlert(params: {
  to: string;
  productName: string;
  sku: string;
  currentStock: number;
}) {
  const content = `
    <h1 style="${titleStyles}">⚠️ Alerte stock bas</h1>
    <p style="${textStyles}">
      Le produit <strong>${params.productName}</strong> (SKU: ${params.sku}) a un stock très bas.
    </p>
    <div style="background: #FFF3E0; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
      <p style="font-size: 13px; color: #999; margin: 0 0 8px;">Stock actuel</p>
      <p style="font-size: 48px; font-weight: 700; color: ${params.currentStock === 0 ? "#D32F2F" : "#F57C00"}; margin: 0;">
        ${params.currentStock}
      </p>
    </div>
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/products" style="${buttonStyles}">
      Réapprovisionner →
    </a>
  `;

  return sendEmail({
    to: params.to,
    subject: `⚠️ Stock bas — ${params.productName}`,
    html: emailTemplate(content),
  });
}

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
}) {
  const content = `
    <h1 style="${titleStyles}">Bienvenue ${params.name} !</h1>
    <p style="${textStyles}">
      Merci de créer un compte sur <strong>Jody Shop</strong>. Nous sommes ravis de vous accueillir !
    </p>
    <p style="${textStyles}">
      Découvrez nos collections et laissez-vous tenter par des pièces uniques à prix accessibles.
    </p>
    <a href="https://jodyshop.tn/catalogue" style="${buttonStyles}">
      Voir la collection →
    </a>
  `;

  return sendEmail({
    to: params.to,
    subject: `Bienvenue ${params.name} — Jody Shop`,
    html: emailTemplate(content),
  });
}