import { z } from "zod";

export const ownerId = z.object({
	"authorization": z.string().refine(v => v.startsWith("Bearer ")),
	"x-tasks-owner-id": z.string().ulid()
});