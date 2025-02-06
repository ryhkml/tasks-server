import { z } from "zod";

const keySchema = z
	.string()
	.length(64)
	.regex(/^[a-zA-Z0-9]{64}$/);

export const taskHeadersSchema = z.object({
	authorization: z.string().refine((v) => {
		const [prefix, key] = v.split(" ");
		return prefix == "Bearer" && keySchema.safeParse(key).success;
	}),
	"x-task-id": z.string().ulid()
});

export const taskNameSchema = z.strictObject({
	name: z
		.string()
		.min(5)
		.max(32)
		.regex(/^(?![0-9-])(?!.*--)[a-z0-9-]{5,32}(?<!-)$/, {
			message: "String cannot start or end with a hyphen, contain consecutive hyphens, or begin with a number"
		})
});
