import { idSchema, tierPriceSchema, tierSchema } from "@openads/db/schema"
import { createSubscriptionCheckoutSession } from "@openads/stripe/checkout"
import {
  archivePrice,
  archiveTierProduct,
  createTierPrice,
  createTierProduct,
  updateTierProduct,
} from "@openads/stripe/products"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  publicProcedure,
  router,
  workspaceProcedure,
} from "../index"

const createInputSchema = tierSchema.extend({
  initialPrices: z.array(tierPriceSchema).min(1, "At least one price is required"),
})

export const tierRouter = router({
  getAll: workspaceProcedure.query(async ({ ctx: { db }, input: { workspaceId } }) => {
    return await db.tier.findMany({
      where: { workspaceId },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: {
        prices: {
          where: { isActive: true },
          orderBy: [{ interval: "asc" }, { amount: "asc" }],
        },
      },
    })
  }),

  getById: workspaceProcedure
    .input(idSchema)
    .query(async ({ ctx: { db }, input: { id, workspaceId } }) => {
      return await db.tier.findFirst({
        where: { id, workspaceId },
        include: {
          prices: {
            orderBy: [{ isActive: "desc" }, { interval: "asc" }, { amount: "asc" }],
          },
        },
      })
    }),

  create: workspaceProcedure
    .input(createInputSchema)
    .mutation(
      async ({
        ctx: { db, stripe, workspace },
        input: { name, description, weight, isActive, order, features, initialPrices },
      }) => {
        const tier = await db.tier.create({
          data: {
            name,
            description: description ?? "",
            weight,
            isActive,
            order,
            features,
            workspaceId: workspace.id,
          },
        })

        let product: any = null
        product = await createTierProduct(stripe, {
          name,
          description,
          metadata: {
            workspaceId: workspace.id,
            tierId: tier.id,
            weight: String(weight),
          },
          features,
        })

        const createdStripePriceIds: string[] = []
        try {
          for (const price of initialPrices) {
            const tierPriceRow = await db.tierPrice.create({
              data: {
                tierId: tier.id,
                interval: price.interval,
                intervalCount: price.intervalCount,
                amount: price.amount,
                currency: price.currency,
              },
            })

            if (product) {
              const stripePrice = await createTierPrice(stripe, {
                productId: product.id,
                unitAmount: price.amount,
                currency: price.currency,
                interval: price.interval,
                intervalCount: price.intervalCount,
                metadata: {
                  workspaceId: workspace.id,
                  tierId: tier.id,
                  tierPriceId: tierPriceRow.id,
                  interval: price.interval,
                  intervalCount: String(price.intervalCount),
                },
              })

              createdStripePriceIds.push(stripePrice.id)

              await db.tierPrice.update({
                where: { id: tierPriceRow.id },
                data: { stripePriceId: stripePrice.id },
              })
            }
          }
        } catch (err) {
          await Promise.allSettled([
            ...createdStripePriceIds.map(id => archivePrice(stripe, id)),
            ...(product ? [archiveTierProduct(stripe, product.id)] : []),
          ])
          
          await db.tierPrice.deleteMany({ where: { tierId: tier.id } })
          await db.tier.delete({ where: { id: tier.id } })
          throw err
        }

        return await db.tier.update({
          where: { id: tier.id },
          data: { stripeProductId: product?.id || null },
          include: {
            prices: {
              orderBy: [{ isActive: "desc" }, { interval: "asc" }, { amount: "asc" }],
            },
          },
        })
      },
    ),

  update: workspaceProcedure
    .input(tierSchema.partial().extend(idSchema.shape))
    .mutation(
      async ({
        ctx: { db, stripe, workspace },
        input: { id, name, description, weight, isActive, order, features },
      }) => {
        const existing = await db.tier.findFirst({
          where: { id, workspaceId: workspace.id },
        })

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND" })
        }

        if (existing.stripeProductId) {
          const featuresChanged =
            features !== undefined &&
            (features.length !== existing.features.length ||
              features.some((f, i) => f !== existing.features[i]))

          const productChanged =
            (name !== undefined && name !== existing.name) ||
            (description !== undefined && description !== existing.description) ||
            (weight !== undefined && weight !== existing.weight) ||
            (isActive !== undefined && isActive !== existing.isActive) ||
            featuresChanged

          if (productChanged) {
            await updateTierProduct(stripe, existing.stripeProductId, {
              name,
              description,
              active: isActive,
              metadata: {
                workspaceId: workspace.id,
                tierId: existing.id,
                weight: String(weight ?? existing.weight),
              },
              features: featuresChanged ? features : undefined,
            })
          }
        }

        return await db.tier.update({
          where: { id },
          data: { name, description, weight, isActive, order, features },
        })
      },
    ),

  delete: workspaceProcedure
    .input(idSchema)
    .mutation(async ({ ctx: { db, stripe, workspace }, input: { id } }) => {
      const existing = await db.tier.findFirst({
        where: { id, workspaceId: workspace.id },
        include: { prices: { where: { isActive: true } } },
      })

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" })
      }

      if (existing.stripeProductId) {
        await archiveTierProduct(stripe, existing.stripeProductId)
      }

      for (const tierPrice of existing.prices) {
        if (tierPrice.stripePriceId) {
          await archivePrice(stripe, tierPrice.stripePriceId)
        }
      }

      await db.tierPrice.updateMany({
        where: { tierId: id, isActive: true },
        data: { isActive: false },
      })

      return await db.tier.update({
        where: { id },
        data: { isActive: false },
      })
    }),

  public: router({
    listForWorkspace: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ ctx: { db }, input: { slug } }) => {
        const workspace = await db.workspace.findUnique({
          where: { slug },
          select: { id: true },
        })

        if (!workspace) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found." })
        }

        return await db.tier.findMany({
          where: { workspaceId: workspace.id, isActive: true },
          orderBy: [{ order: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            description: true,
            weight: true,
            order: true,
            features: true,
            prices: {
              where: { isActive: true, stripePriceId: { not: null } },
              orderBy: [{ interval: "asc" }, { amount: "amount" }],
              select: {
                id: true,
                interval: true,
                intervalCount: true,
                amount: true,
                currency: true,
              },
            },
          },
        })
      }),

    createCheckout: publicProcedure
      .input(
        z.object({
          tierPriceId: z.string(),
          email: z.email(),
        }),
      )
      .mutation(async ({ ctx: { db, stripe, env }, input: { tierPriceId, email } }) => {
        const tierPrice = await db.tierPrice.findFirst({
          where: { id: tierPriceId, isActive: true },
          include: { tier: { include: { workspace: true } } },
        })

        if (!tierPrice || !tierPrice.stripePriceId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Price not available." })
        }

        const { tier } = tierPrice
        const { workspace } = tier

        if (!tier.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tier not available." })
        }

        const session = await createSubscriptionCheckoutSession(stripe, {
          priceId: tierPrice.stripePriceId,
          customerEmail: email,
          successUrl: `${env.APP_URL}/advertise/success?workspace_id=${workspace.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${env.APP_URL}/advertise/cancelled`,
          metadata: {
            workspaceId: workspace.id,
            tierId: tier.id,
            tierPriceId: tierPrice.id,
          },
        })

        if (!session.url) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Stripe did not return a checkout URL.",
          })
        }

        return { url: session.url, sessionId: session.id }
      }),
  }),
})
