/** @jsxImportSource react */
import { Heading, Hr, Section, Text } from "react-email"
import { Layout } from "./_layout"

export interface AdUpdatedProps {
  workspaceName: string
  adName: string
  updatedFields: Array<{ label: string; value: string }>
}

export function AdUpdated({ workspaceName, adName, updatedFields }: AdUpdatedProps) {
  return (
    <Layout preview={`Your ad on ${workspaceName} has been updated`}>
      <Heading className="font-semibold text-2xl">Your ad has been updated</Heading>

      <Text className="text-base text-neutral-700">
        The publisher has made changes to your ad <strong>{adName}</strong> on{" "}
        <strong>{workspaceName}</strong>. Here's a summary of the current creative:
      </Text>

      <Section className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2">
        {updatedFields.map(f => (
          <Text key={f.label} className="my-1 text-sm text-neutral-700">
            <strong>{f.label}:</strong> {f.value}
          </Text>
        ))}
      </Section>

      <Hr className="my-8 border-neutral-200" />

      <Text className="text-neutral-500 text-xs">
        If you have questions about these changes, reply to this email and we'll help you out.
      </Text>
    </Layout>
  )
}

export default AdUpdated
