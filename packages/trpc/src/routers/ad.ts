import { AdStatus, WorkspaceMemberRole } from "@openads/db/client"
import {
  renderAdApproved,
  renderAdChangesRequested,
  renderAdPendingReview,
  renderAdRejected,
  renderAdUpdated,
} from "@openads/emails"
import { fetchAndUploadFavicon } from "@openads/s3/favicon"
import { mapStripeSubscriptionStatus, toDate } from "@openads/stripe/subscription"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { adProcedure, publicProcedure, router, workspaceProcedure } from "../index"
import { findServingAd } from "../lib/ad-serving"

const createFromCheckoutInput = z.object({
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  name: z.string().trim().min(2),
  websiteUrl: z.url(),
  meta: z
    .array(z.object({ fieldId: z.string(), value: z.any() }))
    .optional()
    .default([]),
})

const reviewNoteInput = z.object({ note: z.string().trim().min(1).max(500) })
const optionalNoteInput = z.object({ note: z.string().trim().max(500).optional() })

const TRACKING_WINDOW_SECONDS = 60
const IMPRESSION_LIMIT_PER_MINUTE = 30
const CLICK_LIMIT_PER_MINUTE = 10

/** Email address used for manually created ads — not a real advertiser inbox. */
const INTERNAL_ADVERTISER_EMAIL = "manual@openads.internal"

/** Returns true only when the email is a real, externally reachable address. */
function isRealAdvertiser(email: string | null | undefined): email is string {
  return !!email && email !== INTERNAL_ADVERTISER_EMAIL
}

const checkoutSessionInput = z.object({
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
})

const getConnectedCheckoutSession = async ({
  db,
  stripe,
  workspaceId,
  sessionId,
}: {
  db: typeof import("@openads/db").db
  stripe: import("@openads/stripe").StripeClient
  workspaceId: string
  sessionId: string
}) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId)

  if (session.metadata?.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Checkout workspace mismatch." })
  }

  return { session }
}

export const adRouter = router({
  // Workspace dashboard surface.
  getAll: workspaceProcedure
    .input(
      z.object({
        status: z.enum(AdStatus).optional(),
      }),
    )
    .query(async ({ ctx: { db, workspace }, input: { status } }) => {
      return await db.ad.findMany({
        where: {
          subscription: { workspaceId: workspace.id },
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          subscription: {
            include: {
              advertiser: true,
              tier: true,
              tierPrice: true,
            },
          },
        },
      })
    }),

  getById: adProcedure.query(({ ctx: { ad } }) => ad),

  // Per-ad daily stats over a date range, defaulting to the past 30 days.
  getStats: adProcedure
    .input(z.object({ days: z.number().int().min(1).max(180).default(30) }))
    .query(async ({ ctx: { ad, db }, input: { days } }) => {
      const since = new Date()
      since.setUTCHours(0, 0, 0, 0)
      since.setUTCDate(since.getUTCDate() - (days - 1))

      const rows = await db.adStat.findMany({
        where: { adId: ad.id, date: { gte: since } },
        orderBy: { date: "asc" },
        select: { date: true, impressions: true, clicks: true },
      })

      const totals = rows.reduce(
        (acc, r) => ({
          impressions: acc.impressions + r.impressions,
          clicks: acc.clicks + r.clicks,
        }),
        { impressions: 0, clicks: 0 },
      )

      return { rows, totals, days }
    }),

  approve: adProcedure
    .input(optionalNoteInput)
    .mutation(async ({ ctx: { ad, db, emails, workspace } }) => {
      const updated = await db.ad.update({
        where: { id: ad.id },
        data: {
          status: AdStatus.Approved,
          approvedAt: new Date(),
          rejectedAt: null,
          rejectionNote: null,
        },
      })

      const advertiserEmail = ad.subscription.advertiser.email
      if (isRealAdvertiser(advertiserEmail)) {
        const { html, text } = await renderAdApproved({
          workspaceName: workspace.name,
          adName: ad.name,
        })

        await emails.send({
          to: ad.subscription.advertiser.name
            ? `${ad.subscription.advertiser.name} <${advertiserEmail}>`
            : advertiserEmail,
          subject: `Your ad on ${workspace.name} is now live`,
          html,
          text,
        })
      }

      return updated
    }),

  reject: adProcedure
    .input(reviewNoteInput)
    .mutation(async ({ ctx: { ad, db, emails, logger, stripe, workspace }, input: { note } }) => {
      const updated = await db.ad.update({
        where: { id: ad.id },
        data: {
          status: AdStatus.Rejected,
          rejectedAt: new Date(),
          approvedAt: null,
          rejectionNote: note,
        },
      })

      // Cancel the underlying Stripe subscription so the advertiser stops being billed.
      try {
        await stripe.subscriptions.cancel(ad.subscription.stripeSubscriptionId)
      } catch (err) {
        // Subscription may already be canceled or otherwise inaccessible — leave
        // local state correct and surface the failure in logs only.
        logger.warn("ad.reject: failed to cancel stripe subscription", {
          err,
          stripeSubscriptionId: ad.subscription.stripeSubscriptionId,
          adId: ad.id,
        })
      }

      const advertiserEmail = ad.subscription.advertiser.email
      if (isRealAdvertiser(advertiserEmail)) {
        const { html, text } = await renderAdRejected({
          workspaceName: workspace.name,
          adName: ad.name,
          rejectionNote: note,
        })

        await emails.send({
          to: ad.subscription.advertiser.name
            ? `${ad.subscription.advertiser.name} <${advertiserEmail}>`
            : advertiserEmail,
          subject: `Your ad on ${workspace.name} was not approved`,
          html,
          text,
        })
      }

      return updated
    }),

  requestChanges: adProcedure
    .input(reviewNoteInput)
    .mutation(async ({ ctx: { ad, db, emails, workspace }, input: { note } }) => {
      const updated = await db.ad.update({
        where: { id: ad.id },
        data: {
          status: AdStatus.Pending,
          approvedAt: null,
          rejectedAt: null,
          rejectionNote: note,
        },
      })

      const advertiserEmail = ad.subscription.advertiser.email
      if (isRealAdvertiser(advertiserEmail)) {
        const { html, text } = await renderAdChangesRequested({
          workspaceName: workspace.name,
          adName: ad.name,
          changesNote: note,
        })

        await emails.send({
          to: ad.subscription.advertiser.name
            ? `${ad.subscription.advertiser.name} <${advertiserEmail}>`
            : advertiserEmail,
          subject: "Changes requested on your ad",
          html,
          text,
        })
      }

      return updated
    }),

  update: adProcedure
    .input(
      z.object({
        name: z.string().trim().min(2),
        websiteUrl: z.url(),
        meta: z
          .array(z.object({ fieldId: z.string(), value: z.any() }))
          .optional()
          .default([]),
        advertiserEmail: z.email().optional(),
      }),
    )
    .mutation(async ({ ctx: { ad, db, emails, logger, s3, workspace }, input }) => {
      const updated = await db.ad.update({
        where: { id: ad.id },
        data: { name: input.name, websiteUrl: input.websiteUrl },
      })

      // Replace all meta: delete existing rows then re-create.
      await db.meta.deleteMany({ where: { adId: ad.id } })

      if (input.meta.length > 0) {
        const validFieldIds = new Set(
          (
            await db.field.findMany({ where: { workspaceId: workspace.id }, select: { id: true } })
          ).map(f => f.id),
        )

        const filtered = input.meta.filter(m => validFieldIds.has(m.fieldId))

        if (filtered.length > 0) {
          await db.meta.createMany({
            data: filtered.map(m => ({ adId: ad.id, fieldId: m.fieldId, value: m.value })),
          })
        }
      }

      // Reassign advertiser when the email changes.
      // find-or-create so we never mutate a shared Advertiser row.
      if (
        input.advertiserEmail !== undefined &&
        input.advertiserEmail !== ad.subscription.advertiser.email
      ) {
        let advertiser = await db.advertiser.findFirst({
          where: { workspaceId: workspace.id, email: input.advertiserEmail },
        })

        if (!advertiser) {
          advertiser = await db.advertiser.create({
            data: {
              workspaceId: workspace.id,
              email: input.advertiserEmail,
              name: input.advertiserEmail.split("@")[0] ?? input.advertiserEmail,
            },
          })
        }

        await db.subscription.update({
          where: { id: ad.subscription.id },
          data: { advertiserId: advertiser.id },
        })
      }

      // Re-fetch favicon if the destination URL changed.
      if (input.websiteUrl !== ad.websiteUrl) {
        fetchAndUploadFavicon(s3, {
          websiteUrl: input.websiteUrl,
          key: `workspaces/${workspace.id}/ads/${ad.id}/favicon.png`,
        }).catch(err => {
          logger.warn("ad.update: favicon fetch failed", { err, adId: ad.id })
        })
      }

      // Resolve the effective advertiser email after possible reassignment.
      const effectiveEmail = input.advertiserEmail ?? ad.subscription.advertiser.email

      // Notify the advertiser — skip internal/manual addresses.
      if (isRealAdvertiser(effectiveEmail)) {
        const updatedFields: Array<{ label: string; value: string }> = [
          { label: "Name", value: input.name },
          { label: "Destination URL", value: input.websiteUrl },
        ]

        for (const m of input.meta) {
          const field = await db.field.findUnique({ where: { id: m.fieldId } })
          if (field) {
            updatedFields.push({ label: field.name, value: String(m.value ?? "") })
          }
        }

        const { html, text } = await renderAdUpdated({
          workspaceName: workspace.name,
          adName: input.name,
          updatedFields,
        })

        await emails.send({
          to: effectiveEmail,
          subject: `Your ad on ${workspace.name} has been updated`,
          html,
          text,
        })
      }

      return updated
    }),

  manualCreate: workspaceProcedure
    .input(
      z.object({
        tierId: z.string(),
        name: z.string().trim().min(2),
        websiteUrl: z.url(),
        meta: z
          .array(z.object({ fieldId: z.string(), value: z.any() }))
          .optional()
          .default([]),
      }),
    )
    .mutation(async ({ ctx: { db, workspace, logger, s3 }, input }) => {
      const tier = await db.tier.findFirst({
        where: { id: input.tierId, workspaceId: workspace.id },
        include: { prices: { where: { isActive: true }, take: 1 } },
      })

      if (!tier || tier.prices.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tier not found or has no active price.",
        })
      }

      let advertiser = await db.advertiser.findFirst({
        where: { workspaceId: workspace.id, email: "manual@openads.internal" },
      })

      if (!advertiser) {
        advertiser = await db.advertiser.create({
          data: {
            workspaceId: workspace.id,
            email: "manual@openads.internal",
            name: "Manual Advertiser",
          },
        })
      }

      const subscription = await db.subscription.create({
        data: {
          stripeSubscriptionId: `manual_sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          status: "Active",
          workspaceId: workspace.id,
          tierId: tier.id,
          tierPriceId: tier.prices[0].id,
          advertiserId: advertiser.id,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10), // 10 years
        },
      })

      const ad = await db.ad.create({
        data: {
          subscriptionId: subscription.id,
          status: "Approved",
          name: input.name,
          websiteUrl: input.websiteUrl,
          approvedAt: new Date(),
        },
      })

      await fetchAndUploadFavicon(s3, {
        websiteUrl: input.websiteUrl,
        key: `workspaces/${workspace.id}/ads/${ad.id}/favicon.png`,
      }).catch(err => {
        logger.warn("ad.manualCreate: favicon fetch failed", { err, adId: ad.id })
      })

      if (input.meta.length > 0) {
        const validFieldIds = new Set(
          (
            await db.field.findMany({ where: { workspaceId: workspace.id }, select: { id: true } })
          ).map(f => f.id),
        )
        const filtered = input.meta.filter(m => validFieldIds.has(m.fieldId))

        if (filtered.length > 0) {
          await db.meta.createMany({
            data: filtered.map(m => ({
              adId: ad.id,
              fieldId: m.fieldId,
              value: m.value,
            })),
          })
        }
      }

      return ad
    }),

  // Public surface — embed serving and advertiser checkout success.
  public: router({
    getForPlacement: publicProcedure
      .input(
        z.object({
          slug: z.string(),
          weightGte: z.number().positive().optional(),
          excludeId: z.string().optional(),
        }),
      )
      .query(async ({ ctx: { db }, input }) => {
        const workspace = await db.workspace.findUnique({
          where: { slug: input.slug },
          select: { id: true },
        })

        if (!workspace) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found." })
        }

        return await findServingAd({
          db,
          workspaceId: workspace.id,
          weightGte: input.weightGte,
          excludeId: input.excludeId,
        })
      }),

    recordImpression: publicProcedure
      .input(z.object({ adId: z.string() }))
      .mutation(async ({ ctx: { db, redis, clientIp }, input: { adId } }) => {
        const ad = await db.ad.findUnique({ where: { id: adId }, select: { id: true } })
        if (!ad) return { success: false }

        if (clientIp) {
          const rateKey = `ratelimit:impression:${adId}:${clientIp}`
          const count = await redis.incr(rateKey)
          if (count === 1) await redis.expire(rateKey, TRACKING_WINDOW_SECONDS)
          if (count > IMPRESSION_LIMIT_PER_MINUTE) return { success: false }
        }

        const today = new Date()
        today.setUTCHours(0, 0, 0, 0)

        await db.adStat.upsert({
          where: { adId_date: { adId, date: today } },
          create: { adId, date: today, impressions: 1, clicks: 0 },
          update: { impressions: { increment: 1 } },
        })

        return { success: true }
      }),

    recordClick: publicProcedure
      .input(z.object({ adId: z.string() }))
      .mutation(async ({ ctx: { db, redis, clientIp }, input: { adId } }) => {
        const ad = await db.ad.findUnique({ where: { id: adId }, select: { id: true } })
        if (!ad) return { success: false }

        if (clientIp) {
          const rateKey = `ratelimit:click:${adId}:${clientIp}`
          const count = await redis.incr(rateKey)
          if (count === 1) await redis.expire(rateKey, TRACKING_WINDOW_SECONDS)
          if (count > CLICK_LIMIT_PER_MINUTE) return { success: false }
        }

        const today = new Date()
        today.setUTCHours(0, 0, 0, 0)

        await db.adStat.upsert({
          where: { adId_date: { adId, date: today } },
          create: { adId, date: today, impressions: 0, clicks: 1 },
          update: { clicks: { increment: 1 } },
        })

        return { success: true }
      }),

    getCheckoutInfo: publicProcedure
      .input(checkoutSessionInput)
      .query(async ({ ctx: { db, stripe }, input: { workspaceId, sessionId } }) => {
        const { session } = await getConnectedCheckoutSession({
          db,
          stripe,
          workspaceId,
          sessionId,
        })

        if (session.status !== "complete") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Checkout has not completed yet.",
          })
        }

        const metadata = session.metadata
        const tierPriceId = metadata?.tierPriceId

        if (!tierPriceId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Missing checkout metadata." })
        }

        const [workspace, tierPrice, fields, existingAd] = await Promise.all([
          db.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, name: true, slug: true, faviconUrl: true },
          }),
          db.tierPrice.findUnique({
            where: { id: tierPriceId },
            select: {
              id: true,
              interval: true,
              intervalCount: true,
              amount: true,
              currency: true,
              tier: { select: { id: true, name: true, weight: true } },
            },
          }),
          db.field.findMany({
            where: { workspaceId },
            orderBy: { order: "asc" },
          }),
          (async () => {
            if (typeof session.subscription !== "string") return null
            return await db.ad.findFirst({
              where: { subscription: { stripeSubscriptionId: session.subscription } },
              include: { meta: true },
            })
          })(),
        ])

        if (!workspace || !tierPrice) {
          throw new TRPCError({ code: "NOT_FOUND" })
        }

        return {
          workspace,
          tier: tierPrice.tier,
          tierPrice,
          fields,
          customerEmail: session.customer_email ?? null,
          existingAd,
        }
      }),

    // Gated only by the Stripe Checkout session id, which isn't a secret — it
    // lives in the success-URL query string. The safeguard against malicious
    // overwrites is that every submission resets `status` to Pending, so a
    // reviewer still has to approve before the creative serves.
    createFromCheckout: publicProcedure
      .input(createFromCheckoutInput)
      .mutation(
        async ({
          ctx: { db, emails, logger, s3, stripe, env },
          input: { workspaceId, sessionId, name, websiteUrl, meta },
        }) => {
          const { session } = await getConnectedCheckoutSession({
            db,
            stripe,
            workspaceId,
            sessionId,
          })

          if (session.status !== "complete") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Checkout has not completed yet.",
            })
          }

          if (typeof session.subscription !== "string") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Checkout session has no subscription.",
            })
          }

          const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription)
          const metadata = stripeSubscription.metadata ?? session.metadata
          const tierPriceId = metadata?.tierPriceId
          const customerEmail = session.customer_email

          if (!workspaceId || !tierPriceId || !customerEmail) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Missing checkout metadata." })
          }

          const tierPrice = await db.tierPrice.findUnique({
            where: { id: tierPriceId },
            select: {
              id: true,
              tierId: true,
              tier: { select: { id: true, name: true, weight: true, workspaceId: true } },
            },
          })

          if (!tierPrice || tierPrice.tier.workspaceId !== workspaceId) {
            throw new TRPCError({ code: "NOT_FOUND" })
          }

          const tier = tierPrice.tier

          let advertiser = await db.advertiser.findFirst({
            where: { workspaceId, email: customerEmail },
          })

          if (!advertiser) {
            advertiser = await db.advertiser.create({
              data: {
                workspaceId,
                email: customerEmail,
                name: name.slice(0, 80),
              },
            })
          }

          // Idempotent — the Stripe webhook may have already created this row.
          const subscription = await db.subscription.upsert({
            where: { stripeSubscriptionId: stripeSubscription.id },
            create: {
              stripeSubscriptionId: stripeSubscription.id,
              stripeCustomerId:
                typeof stripeSubscription.customer === "string"
                  ? stripeSubscription.customer
                  : stripeSubscription.customer.id,
              status: mapStripeSubscriptionStatus(stripeSubscription.status),
              cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
              currentPeriodStart: toDate(stripeSubscription.items.data[0]?.current_period_start),
              currentPeriodEnd: toDate(stripeSubscription.items.data[0]?.current_period_end),
              workspaceId,
              tierId: tier.id,
              tierPriceId: tierPrice.id,
              advertiserId: advertiser.id,
            },
            update: {
              status: mapStripeSubscriptionStatus(stripeSubscription.status),
              cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
              currentPeriodStart: toDate(stripeSubscription.items.data[0]?.current_period_start),
              currentPeriodEnd: toDate(stripeSubscription.items.data[0]?.current_period_end),
            },
          })

          const ad = await db.ad.upsert({
            where: { subscriptionId: subscription.id },
            create: {
              subscriptionId: subscription.id,
              status: "Pending",
              name,
              websiteUrl,
            },
            update: {
              name,
              websiteUrl,
              // Resubmission re-enters the review queue.
              status: "Pending",
              approvedAt: null,
              rejectedAt: null,
              rejectionNote: null,
            },
          })

          // Best-effort — failure is logged but doesn't block ad creation.
          await fetchAndUploadFavicon(s3, {
            websiteUrl,
            key: `workspaces/${workspaceId}/ads/${ad.id}/favicon.png`,
          }).catch(err => {
            logger.warn("ad.createFromCheckout: favicon fetch failed", {
              err,
              adId: ad.id,
              websiteUrl,
            })
            return null
          })

          // Transactional replace so concurrent reads never see an ad with zero
          // meta rows between the delete and the recreate.
          if (meta.length > 0) {
            const validFieldIds = new Set(
              (await db.field.findMany({ where: { workspaceId }, select: { id: true } })).map(
                f => f.id,
              ),
            )
            const filtered = meta.filter(m => validFieldIds.has(m.fieldId))

            await db.$transaction([
              db.meta.deleteMany({ where: { adId: ad.id } }),
              ...(filtered.length > 0
                ? [
                    db.meta.createMany({
                      data: filtered.map(m => ({
                        adId: ad.id,
                        fieldId: m.fieldId,
                        value: m.value,
                      })),
                    }),
                  ]
                : []),
            ])
          }

          // Notify workspace owners and managers.
          const reviewers = await db.workspaceMember.findMany({
            where: {
              workspaceId,
              role: { in: [WorkspaceMemberRole.Owner, WorkspaceMemberRole.Manager] },
            },
            include: { user: { select: { email: true, name: true } } },
          })

          const workspace = await db.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, name: true },
          })

          if (workspace && reviewers.length > 0) {
            const { html, text } = await renderAdPendingReview({
              workspaceName: workspace.name,
              advertiserName: advertiser.name,
              advertiserEmail: customerEmail,
              tierName: tier.name,
              reviewUrl: `${env.APP_URL}/${workspace.id}/ads/${ad.id}`,
            })

            await Promise.all(
              reviewers
                .filter(r => r.user.email)
                .map(r =>
                  emails.send({
                    to: r.user.name ? `${r.user.name} <${r.user.email}>` : r.user.email!,
                    subject: `New ad pending review on ${workspace.name}`,
                    html,
                    text,
                  }),
                ),
            )
          }

          return { adId: ad.id, subscriptionId: subscription.id }
        },
      ),
  }),
})
