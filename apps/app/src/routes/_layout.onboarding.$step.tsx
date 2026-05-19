import { ONBOARDING_STEPS } from "@openads/utils"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"
import { z } from "zod"
import { OnboardingNextButton } from "~/components/onboarding/next-button"
import { OnboardingStep } from "~/components/onboarding/step"

import { CreateWorkspaceForm } from "~/components/workspaces/create-workspace-form"
import { siteConfig } from "~/config/site"
import { useOnboardingProgress } from "~/hooks/use-onboarding-progress"

export const Route = createFileRoute("/_layout/onboarding/$step")({
  params: {
    parse: p => z.object({ step: z.enum(ONBOARDING_STEPS) }).parse(p),
  },

  validateSearch: z.object({
    workspaceId: z.string().optional(),
  }),

  onError: error => {
    if (error?.routerCode === "PARSE_PARAMS") {
      throw notFound()
    }
  },

  component: OnboardingStepPage,
})

function OnboardingStepPage() {
  const { step } = Route.useParams()
  const { workspaceId } = Route.useSearch()
  const { continueTo } = useOnboardingProgress()



  switch (step) {
    case "welcome":
      return (
        <OnboardingStep
          title={`Welcome to ${siteConfig.name}`}
          description={siteConfig.description}
        >
          <OnboardingNextButton
            step="workspace"
            suffix={<ArrowRightIcon />}
            className="text-base min-w-2/3"
          >
            Get started
          </OnboardingNextButton>
        </OnboardingStep>
      )

    case "workspace":
      return (
        <OnboardingStep
          title="Create your workspace"
          description="For example, you can use the name of your company or department."
        >
          <CreateWorkspaceForm onSuccess={({ id }) => continueTo("completed", id)} />
        </OnboardingStep>
      )


  }
}
