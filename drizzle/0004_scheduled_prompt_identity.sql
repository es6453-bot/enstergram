ALTER TABLE `rounds` ADD `prompt_id` text REFERENCES prompts(id);--> statement-breakpoint
CREATE UNIQUE INDEX `one_prompt_round` ON `rounds` (`prompt_id`);