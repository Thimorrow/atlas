export const NOTEBOOK_WIDTH = 1000;
export const NOTEBOOK_HEIGHT = 1400;
export type NotebookPaper = "blank" | "lined" | "grid";
export type NotebookPoint = { x: number; y: number; pressure: number };
export type NotebookStroke = { id: string; points: NotebookPoint[]; color: string; width: number };
export type NotebookBlock = {
  id: string;
  type: "text" | "image" | "pdf";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fileId?: string;
  pageNumber?: number;
};
export type NotebookContent = { strokes: NotebookStroke[]; blocks: NotebookBlock[] };
export type NotebookPageDTO = {
  id: string;
  subjectId: string;
  title: string;
  paper: NotebookPaper;
  content: NotebookContent;
  createdAt: string;
  updatedAt: string;
};
export type NotebookPageSummary = Omit<NotebookPageDTO, "content">;

export type NotebookPage = NotebookPageDTO;
