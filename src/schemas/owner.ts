import { z } from "zod";

export const ownerName = z.object({
	name: z.string()
		.min(5)
		.max(32)
		.regex(/^(?![0-9-])(?!.*--)[a-z0-9-]{5,32}(?<!-)$/, {
			message: "String cannot start or end with a hyphen, contain consecutive hyphens, or begin with a number"
		})
});