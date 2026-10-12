import { useNavigate } from "react-router-dom";
import { LayoutGrid, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { TaskBoard } from "./TaskBoard";
import { TaskViewSwitch } from "./project-configs";

/** All tasks on one Kanban board. */
export function TaskBoardPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Task Board"
        subtitle="Drag a card to change its status"
        icon={<LayoutGrid className="h-5 w-5" />}
        actions={
          hasRole() ? (
            <Button variant="primary" onClick={() => navigate("/projects/tasks/new")}>
              <Plus className="h-4 w-4" /> New Task
            </Button>
          ) : undefined
        }
      />
      <TaskViewSwitch active="board" />
      <TaskBoard />
    </div>
  );
}
