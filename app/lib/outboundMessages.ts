import "server-only";
import { Resend } from "resend";
import Twilio from "twilio";
import { estimateSmsSegments, prepareOutboundSmsText } from "./smsOptOut";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  return apiKey ? new Resend(apiKey) : null;
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  return accountSid && authToken ? Twilio(accountSid, authToken) : null;
}

export async function sendSms(args: { to: string; body: string }) {
  const twilio = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!twilio || !from) {
    throw new Error("Missing Twilio environment variables");
  }

  const body = prepareOutboundSmsText(args.body);

  if (body.length !== args.body.length) {
    console.log("SMS_NORMALIZED_FOR_GSM", {
      originalLength: args.body.length,
      normalizedLength: body.length,
    });
  }

  const smsEstimate = estimateSmsSegments(body);

  console.log("[SMS_DEBUG]", {
    encoding: smsEstimate.encoding,
    estimatedSegments: smsEstimate.estimatedSegments,
    length: smsEstimate.length,
  });

  const result = await twilio.messages.create({
    body,
    from,
    to: args.to,
  });

  return {
    body,
    from,
    providerMessageId: result.sid || "",
  };
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
}) {
  const resend = getResendClient();
  const from = process.env.RESEND_FROM_EMAIL;

  if (!resend || !from) {
    throw new Error("Missing Resend environment variables");
  }

  const { data, error } = await resend.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    text: args.body,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    from,
    providerMessageId: data?.id || "",
  };
}
