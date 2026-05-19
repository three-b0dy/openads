import { Button } from "@openads/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@openads/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@openads/ui/select"
import { PlusIcon, Loader2Icon } from "lucide-react"
import { useState } from "react"
import { ManualAdForm } from "~/components/ads/manual-ad-form"
import { trpc } from "~/lib/trpc"

export function CreateManualAdDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [selectedTierId, setSelectedTierId] = useState<string>("")

  const tiersQuery = trpc.tier.getAll.useQuery({ workspaceId }, { enabled: open })
  const fieldsQuery = trpc.field.getAll.useQuery({ workspaceId }, { enabled: open })

  const utils = trpc.useUtils()

  const handleSuccess = () => {
    setOpen(false)
    setSelectedTierId("")
    utils.ad.getAll.invalidate({ workspaceId })
    utils.ad.getStats.invalidate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button prefix={<PlusIcon />}>Add Manual Ad</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Manual Ad</DialogTitle>
          <DialogDescription>
            Manually create an ad for this workspace. This will bypass Stripe billing and
            immediately mark the ad as Approved.
          </DialogDescription>
        </DialogHeader>

        {tiersQuery.isLoading || fieldsQuery.isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2Icon className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Tier</label>
              <Select value={selectedTierId} onValueChange={setSelectedTierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiersQuery.data?.map(tier => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTierId && fieldsQuery.data && (
              <ManualAdForm
                workspaceId={workspaceId}
                tierId={selectedTierId}
                fields={fieldsQuery.data}
                onSuccess={handleSuccess}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
