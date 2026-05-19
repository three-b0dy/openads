import { cx } from "@openads/ui/cva"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@openads/ui/form"
import { Input } from "@openads/ui/input"
import { Switch } from "@openads/ui/switch"
import { Textarea } from "@openads/ui/textarea"
import type { HTMLAttributes } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { ImageUpload } from "~/components/ads/image-upload"
import { FormButton } from "~/components/form-button"
import { type RouterOutputs, trpc } from "~/lib/trpc"

type Ad = NonNullable<RouterOutputs["ad"]["getById"]>
type Field = RouterOutputs["field"]["getAll"][number]

const buildSchema = (fields: Field[]) => {
  const metaShape: Record<string, z.ZodTypeAny> = {}

  for (const field of fields) {
    let schema: z.ZodTypeAny

    switch (field.type) {
      case "Url":
      case "Image":
        schema = z.url()
        break
      case "Number":
        schema = z.coerce.number()
        break
      case "Switch":
        schema = z.boolean()
        break
      default:
        schema = z.string()
        break
    }

    if (!field.isRequired && field.type !== "Switch") {
      schema = schema.optional().or(z.literal(""))
    }

    if (field.isRequired && field.type !== "Switch") {
      schema = (schema as z.ZodString).min(1, { message: `${field.name} is required` })
    }

    metaShape[field.id] = schema
  }

  return z.object({
    name: z.string().trim().min(2, { message: "Name is too short" }),
    websiteUrl: z.url(),
    advertiserEmail: z.email({ message: "Enter a valid email" }).or(z.literal("")).optional(),
    meta: z.object(metaShape).optional().default({}),
  })
}

type EditAdFormProps = HTMLAttributes<HTMLFormElement> & {
  workspaceId: string
  adId: string
  ad: Ad
  fields: Field[]
  onSuccess?: () => void
  onCancel?: () => void
}

export function EditAdForm({
  className,
  workspaceId,
  adId,
  ad,
  fields,
  onSuccess: onSuccessCallback,
  onCancel,
  ...props
}: EditAdFormProps) {
  const schema = buildSchema(fields)
  type FormValues = z.infer<typeof schema>

  // Build meta default values from the existing ad.meta array.
  const metaDefaults: Record<string, unknown> = {}
  for (const m of ad.meta) {
    metaDefaults[m.fieldId] = m.value
  }

  const form = useForm<FormValues>({
    defaultValues: {
      name: ad.name,
      websiteUrl: ad.websiteUrl,
      advertiserEmail: ad.subscription.advertiser.email ?? "",
      meta: metaDefaults as FormValues["meta"],
    },
  })

  const utils = trpc.useUtils()

  const submit = trpc.ad.update.useMutation({
    onSuccess: async () => {
      toast.success("Ad updated")
      await utils.ad.getById.invalidate({ workspaceId, adId })
      await utils.ad.getAll.invalidate({ workspaceId })
      onSuccessCallback?.()
    },
    onError: error => {
      toast.error(error.message)
    },
  })

  const onSubmit = (values: FormValues) => {
    const meta = Object.entries(values.meta ?? {})
      .filter(([_, v]) => v !== undefined && v !== "")
      .map(([fieldId, value]) => ({ fieldId, value }))

    // Only pass advertiserEmail when it is non-empty and different from the current value.
    const advertiserEmail =
      values.advertiserEmail && values.advertiserEmail !== ad.subscription.advertiser.email
        ? values.advertiserEmail
        : undefined

    submit.mutate({
      workspaceId,
      adId,
      name: values.name,
      websiteUrl: values.websiteUrl,
      advertiserEmail,
      meta,
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cx("grid gap-4", className)}
        noValidate
        {...props}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product / brand name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Co." autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="websiteUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination URL</FormLabel>
              <FormControl>
                <Input type="url" placeholder="https://acme.co" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="advertiserEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Advertiser email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="advertiser@example.com"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <p className="text-muted-foreground text-xs">
                Leave blank to keep the current advertiser. Changing this creates or reassigns to an
                existing advertiser with that email.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {fields.length > 0 && (
          <div className="grid gap-4 border-t pt-4">
            <p className="font-medium text-sm">Additional details</p>
            {fields.map(field => (
              <FormField
                key={field.id}
                control={form.control}
                name={`meta.${field.id}` as `meta.${string}`}
                render={({ field: input }) => (
                  <FormItem>
                    <FormLabel>
                      {field.name}
                      {field.isRequired && <span className="ml-1 text-red-500">*</span>}
                    </FormLabel>
                    <FormControl>{renderMetaInput(field, input, workspaceId)}</FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <FormButton isPending={submit.isPending} className="flex-1">
            Save changes
          </FormButton>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </Form>
  )
}

function renderMetaInput(
  field: Field,
  input: { value: unknown; onChange: (value: unknown) => void; onBlur: () => void; name: string },
  workspaceId: string,
) {
  const placeholder = field.placeholder || undefined

  if (field.type === "Textarea") {
    return (
      <Textarea
        name={input.name}
        placeholder={placeholder}
        value={(input.value as string) ?? ""}
        onChange={input.onChange}
        onBlur={input.onBlur}
      />
    )
  }

  if (field.type === "Switch") {
    return <Switch checked={!!input.value} onCheckedChange={input.onChange} />
  }

  if (field.type === "Image") {
    return (
      <ImageUpload
        workspaceId={workspaceId}
        isManual={true}
        value={(input.value as string | null) ?? null}
        onChange={url => input.onChange(url ?? "")}
      />
    )
  }

  const type = field.type === "Number" ? "number" : field.type === "Url" ? "url" : "text"
  return (
    <Input
      type={type}
      name={input.name}
      placeholder={placeholder}
      value={(input.value as string | number | undefined) ?? ""}
      onChange={input.onChange}
      onBlur={input.onBlur}
    />
  )
}
