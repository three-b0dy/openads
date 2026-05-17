export type EmailAddress = string

export type EmailRecipient = EmailAddress | EmailAddress[]

export interface EmailClientConfig {
  region: string
  accessKeyId: string
  secretAccessKey: string
  from: EmailAddress
}

export interface SendEmailInput {
  to: EmailRecipient
  subject: string
  html: string
  text?: string
  replyTo?: EmailAddress
  cc?: EmailRecipient
  bcc?: EmailRecipient
  from?: EmailAddress
}
