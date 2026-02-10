export const fadeIn = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

export const slideFromLeft = {
	initial: { x: -20, opacity: 0 },
	animate: { x: 0, opacity: 1 },
	exit: { x: 20, opacity: 0 },
};

export const slideFromRight = {
	initial: { x: 20, opacity: 0 },
	animate: { x: 0, opacity: 1 },
	exit: { x: -20, opacity: 0 },
};

export const transition = {
	type: "spring",
	stiffness: 200,
	damping: 20,
};

export const staggerContainer = {
	animate: {
		transition: {
			staggerChildren: 0.1,
		},
	},
};

export const buttonHover = {
	hover: { scale: 1.05 },
	tap: { scale: 0.95 },
};
export const SwipeFadeVariants = {
	initial: {
	  opacity: 0,
	},
	animate: {
	  opacity: 1,
	},
	exit: {
	  opacity: 0,
	},
  };
  