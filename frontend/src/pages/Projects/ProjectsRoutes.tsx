import { Routes, Route, Navigate } from "react-router-dom";
import { DocListPage } from "@/components/doc/doc-list-page";
import { DocFormPage } from "@/components/doc/doc-form-page";
import { ProjectsDashboardPage } from "./ProjectsDashboardPage";
import { TaskBoardPage } from "./TaskBoardPage";
import { ProjectGanttPage } from "./ProjectGanttPage";
import { PROJECT_CONFIG, TASK_CONFIG } from "./project-configs";

/** /projects/* — overview, projects (with an embedded task board), tasks, the full-screen board and the timeline (Gantt). */
export function ProjectsRoutes() {
  return (
    <Routes>
      <Route index element={<ProjectsDashboardPage />} />
      <Route path="list" element={<DocListPage config={PROJECT_CONFIG} />} />
      <Route path="list/:name" element={<DocFormPage config={PROJECT_CONFIG} />} />
      <Route path="tasks" element={<DocListPage config={TASK_CONFIG} />} />
      <Route path="tasks/:name" element={<DocFormPage config={TASK_CONFIG} />} />
      <Route path="board" element={<TaskBoardPage />} />
      <Route path="timeline" element={<ProjectGanttPage />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
