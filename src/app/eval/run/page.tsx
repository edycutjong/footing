import { notFound } from "next/navigation";
import Runner from "./runner";

// Local eval harness only: never served by a production build (it would let anyone spend the model quota).
export default function EvalRunPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Runner />;
}
