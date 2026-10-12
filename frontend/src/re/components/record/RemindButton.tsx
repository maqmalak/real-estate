/** One-click reminder: WhatsApp template first, then the fallback gateways (SMS / email) — realestate.whatsapp.channel.send_now. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/re/components/ui/button";
import { post } from "@/re/lib/api";

export type ReminderType = "Installment Reminder" | "Overdue Notice" | "Booking Confirmation" | "Payment Receipt" | "Society Bill" | "Follow Up" | "Site Visit Invitation";

export function RemindButton({ type, doctype, name, label, size = "sm", variant = "outline" }: {
  type: ReminderType; doctype: string; name: string; label?: string; size?: ButtonProps["size"]; variant?: ButtonProps["variant"];
}) {
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () => post<string>("realestate.whatsapp.channel.send_now", { reminder_type: type, reference_doctype: doctype, reference_name: name }),
    onSuccess: (status) => {
      (status === "Failed" ? toast.error : toast.success)(`${type}: ${status}`);
      void qc.invalidateQueries({ queryKey: ["timeline"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size={size} variant={variant} disabled={send.isPending} onClick={(e) => { e.preventDefault(); e.stopPropagation(); send.mutate(); }} title={`Send ${type} (WhatsApp, then SMS / email)`}>
      {send.isPending ? <Loader2 className="animate-spin" /> : <BellRing />}{label ?? type}
    </Button>
  );
}
