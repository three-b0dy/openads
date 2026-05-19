type Props = {
  userId?: string
  fullName?: string | null
}

export const setupAnalytics = async (options?: Props) => {
  return {
    track: (options: any) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("Track", options)
      }
    },
  }
}
