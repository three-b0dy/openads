export const ONBOARDING_STEPS = ["welcome", "workspace", "completed"] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]
