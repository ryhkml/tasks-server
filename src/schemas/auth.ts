import { z } from "zod";

const keySchema = z.string().length(42).regex(/^[a-zA-Z0-9_-]{42}$/);

export const ownerHeadersSchema = z.object({
	"authorization": z.string().refine(v => {
		const [prefix, key] = v.split(" ");
		return prefix == "Bearer" && keySchema.safeParse(key).success;
	}),
	"x-tasks-owner-id": z.string().ulid()
});