/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from "react-email"
import { Layout } from "./_layout"

export interface MagicLinkProps {
  url: string
}

export function MagicLink({ url }: MagicLinkProps) {
  const previewText = `Sign in to OpenAds`

  return (
    <Layout preview={previewText}>
      <Heading className="text-2xl font-semibold">Sign in to OpenAds</Heading>

      <Text className="text-base text-neutral-700">
        Click the button below to sign in to your account. This link will expire in 10 minutes.
      </Text>

      <Section className="my-8 text-center">
        <Button
          href={url}
          className="rounded-md bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
        >
          Sign in
        </Button>
      </Section>

      <Text className="text-sm text-neutral-600">
        Or copy and paste this link into your browser:
        <br />
        <Link href={url} className="text-neutral-900 underline">
          {url}
        </Link>
      </Text>
    </Layout>
  )
}

export default MagicLink
