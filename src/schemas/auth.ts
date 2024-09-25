import { z } from "zod";

const keySchema = z.string().length(64).regex(/^[a-zA-Z0-9]{64}$/);

export const ownerHeadersSchema = z.object({
	"authorization": z.string().refine(v => {
		const [prefix, key] = v.split(" ");
		return prefix == "Bearer" && keySchema.safeParse(key).success;
	}),
	"x-tasks-owner-id": z.string().ulid()
});