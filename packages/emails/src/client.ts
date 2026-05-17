import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses"
import type { EmailClientConfig, SendEmailInput } from "./types"

export function createEmailClient(config: EmailClientConfig) {
  const sesClient = new SESClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  async function send(input: SendEmailInput) {
    const toAddresses = Array.isArray(input.to) ? input.to : [input.to]
    const ccAddresses = input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : []
    const bccAddresses = input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : []

    const command = new SendEmailCommand({
      Source: input.from ?? config.from,
      Destination: {
        ToAddresses: toAddresses,
        CcAddresses: ccAddresses.length > 0 ? ccAddresses : undefined,
        BccAddresses: bccAddresses.length > 0 ? bccAddresses : undefined,
      },
      Message: {
        Subject: {
          Data: input.subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: input.html,
            Charset: "UTF-8",
          },
          ...(input.text
            ? {
                Text: {
                  Data: input.text,
                  Charset: "UTF-8",
                },
              }
            : {}),
        },
      },
      ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
    })

    const response = await sesClient.send(command)
    return response
  }

  return {
    send,
  }
}

export type EmailClient = ReturnType<typeof createEmailClient>
