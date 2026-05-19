import type { ReactElement } from "react"

const Provider = ({ clientId }: { clientId: string }): ReactElement => <></>

const track = (options: any) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("Track", options)
  }
}

export { Provider, track }
