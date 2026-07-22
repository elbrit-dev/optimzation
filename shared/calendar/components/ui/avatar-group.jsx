import * as React from "react";

import { Avatar, AvatarFallback } from "@calendar/components/ui/avatar";
import { cn } from "@calendar/lib/utils";

const AvatarGroup = ({
    children,
    max,
    className,
    ...props
}) => {
	const totalAvatars = React.Children.count(children);
	const displayedAvatars = React.Children.toArray(children)
		.slice(0, max)
		.reverse();
	const remainingAvatars = max ? Math.max(totalAvatars - max, 0) : 0;
	const avatarClassName =
		React.isValidElement(displayedAvatars[0])
			? displayedAvatars[0].props.className
			: "";

	return (
        <div
            className={cn("flex items-center flex-row-reverse", className)}
            {...props}>
            {remainingAvatars > 0 && (
				<Avatar className={cn("-ml-2 hover:z-10 relative ring-2 ring-background", avatarClassName)}>
					<AvatarFallback className="bg-muted-foreground text-white">
						+{remainingAvatars}
					</AvatarFallback>
				</Avatar>
			)}
            {displayedAvatars.map((avatar, index) => {
				if (!React.isValidElement(avatar)) return null;

				return (
                    <div key={index} className="-ml-2 hover:z-10 relative">
                        {React.cloneElement(avatar, {
							className: cn(avatar.props.className, "ring-2 ring-background"),
						})}
                    </div>
                );
			})}
        </div>
    );
};

export { AvatarGroup };
