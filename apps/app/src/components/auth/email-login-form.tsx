import { Button } from "@openads/ui/button"
import { Input } from "@openads/ui/input"
import { Label } from "@openads/ui/label"
import { useState } from "react"
import { authClient } from "~/lib/auth"

interface EmailLoginFormProps {
  callbackURL?: string
}

export function EmailLoginForm({ callbackURL }: EmailLoginFormProps) {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setIsLoading(true)
    setMessage("")

    try {
      await authClient.signIn.magicLink({
        email,
        callbackURL,
      })
      setMessage("Magic link sent! Check your email.")
    } catch (err: any) {
      setMessage(err.message || "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-2 text-left">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>

      {message && <p className="text-sm text-center text-muted-foreground">{message}</p>}

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Please wait..." : "Send Magic Link"}
      </Button>
    </form>
  )
}
