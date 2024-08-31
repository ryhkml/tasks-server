import { z } from "zod";

const keySchema = z.string().regex(/^[a-zA-Z0-9_-]{42}$/);

export const ownerId = z.object({
	"authorization": z.string().refine(v => {
		const [prefix, key] = v.split(" ");
		return prefix == "Bearer" && keySchema.safeParse(key).success;
	}),
	"x-tasks-owner-id": z.string().ulid()
});