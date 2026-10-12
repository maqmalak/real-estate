import { RotateCcw } from "lucide-react";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { useFilterOptions, type PlotFilters } from "@/re/lib/plots";

export function PlotFilterPanel({ filters, set, clear, count, total }: { filters: PlotFilters; set: (p: Partial<PlotFilters>) => void; clear: () => void; count: number; total: number }) {
  const { data: opts } = useFilterOptions();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm"><b>{count}</b> <span className="text-muted-foreground">of {total} plots</span></p>
        <Button variant="ghost" size="sm" onClick={clear}><RotateCcw /> Reset</Button>
      </div>
      <div>
        <Label htmlFor="f-q">Search</Label>
        <Input id="f-q" placeholder="Plot no, owner, street" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="f-block">Block</Label>
          <Select id="f-block" value={filters.block} onChange={(e) => set({ block: e.target.value })}>
            <option value="">All</option>
            {opts?.blocks.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-type">Type</Label>
          <Select id="f-type" value={filters.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">All</option>
            <option>Residential</option>
            <option>Commercial</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="f-size">Size</Label>
        <Select id="f-size" value={filters.size} onChange={(e) => set({ size: e.target.value })}>
          <option value="">All sizes</option>
          {opts?.sizes.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="f-status">Status</Label>
          <Select id="f-status" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option>
            {["Available", "Hold", "Reserved", "Booked", "Sold", "Possession Given", "Blocked"].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-pay">Payment</Label>
          <Select id="f-pay" value={filters.payment} onChange={(e) => set({ payment: e.target.value })}>
            <option value="">All</option>
            <option value="Clear">Clear (paid)</option>
            <option>Due</option>
            <option>Overdue</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="f-cat">Category</Label>
        <Select id="f-cat" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">Any</option>
          <option value="corner">Corner</option>
          <option value="park">Park facing</option>
          <option value="boulevard">Main boulevard</option>
        </Select>
      </div>
      <div>
        <Label>Price range (PKR)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input inputMode="numeric" placeholder="Min" aria-label="Minimum price" value={filters.minPrice} onChange={(e) => set({ minPrice: e.target.value.replace(/\D/g, "") })} />
          <Input inputMode="numeric" placeholder="Max" aria-label="Maximum price" value={filters.maxPrice} onChange={(e) => set({ maxPrice: e.target.value.replace(/\D/g, "") })} />
        </div>
      </div>
    </div>
  );
}
