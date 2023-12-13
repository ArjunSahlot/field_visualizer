paper.setup("canvas");

let WIDTH = paper.view.size.width;
let HEIGHT = paper.view.size.height;
let field;
let pointCharges;
let selected = null;

function random(min, max) {
	return Math.random() * (max - min) + min;
}

class PointCharge {
	INIT_RANGE = 0.5; // middle 50%

	constructor() {
		this.position = new paper.Point(
			random((WIDTH * (1 - this.INIT_RANGE)) / 2, (WIDTH * (1 + this.INIT_RANGE)) / 2),
			random((HEIGHT * (1 - this.INIT_RANGE)) / 2, (HEIGHT * (1 + this.INIT_RANGE)) / 2)
		);
		this.setCharge(random(0, 1) > 0.5 ? 1 : -1);
		this.locked = false;
		this.diameter = 60;
		this.label = "";
	}

	setPosition(x, y) {
		this.position = new paper.Point(x, y);
	}

	setCharge(charge) {
		this.item?.remove();
		this.item = null;
		this.loadingPromise?.then(() => {
			this.item.remove();
			this.item = null;
		});
		this.charge = charge;
		const path = "assets/" + (charge < 0 ? "negative" : "positive") + ".svg";

		this.loadingPromise = new Promise((resolve, reject) => {
			paper.project.importSVG(path, (item) => {
				if (item) {
					this.item = item;
					this.hide();
					this.setupHandlers();
					resolve();
				} else {
					console.error("Failed to load SVG:", path);
					reject("Failed to load SVG");
				}
			});
		});
	}

	setupHandlers() {
		this.item.onMouseEnter = this.onEnter.bind(this);
		this.item.onMouseLeave = this.onLeave.bind(this);
		this.item.onMouseDrag = this.onDrag.bind(this);
		this.item.onDoubleClick = this.onClick.bind(this);
	}

	onEnter() {
		if (!this.locked) {
			this.item.strokeWidth = 5;
			this.item.strokeColor = "yellow";

			document.body.style.cursor = "grab";
		}

		const infoBox = document.getElementById("infoBox");
		if (infoBox.classList.contains("hidden")) {
			infoBox.classList.remove("hidden");
		}

		const title = document.getElementById("infoTitle");
		title.innerHTML = "Point Charge";

		const info1 = document.getElementById("iline1");
		info1.innerHTML = "Label: " + (this.label || "NONE");
		const info2 = document.getElementById("iline2");
		info2.innerHTML = "Position: (" + this.position.x.toFixed(0) + ", " + this.position.y.toFixed(0) + ")";
		const info3 = document.getElementById("iline3");
		info3.innerHTML = "Charge: " + this.charge;
		const info4 = document.getElementById("iline4");
		info4.innerHTML = "Locked: " + this.locked;
	}

	onLeave() {
		this.item.strokeWidth = 0;

		document.body.style.cursor = "default";

		const infoBox = document.getElementById("infoBox");
		if (!infoBox.classList.contains("hidden")) {
			infoBox.classList.add("hidden");
		}
	}

	onDrag(event) {
		if (!this.locked) {
			document.body.style.cursor = "grabbing";
			this.setPosition(event.point.x, event.point.y);
			this.draw();
			field.update(pointCharges);
			field.draw();
		}
	}

	onClick(event) {
		selected?.deselect();
		selected = this;
		openDialog();
		if (this.item) {
			this.item.selected = true;
		} else if (this.loadingPromise) {
			this.loadingPromise.then(() => {
				this.item.selected = true;
			});
		}
	}

	deselect() {
		closeDialog();
		selected = null;
		if (this.item) {
			this.item.selected = false;
		} else if (this.loadingPromise) {
			this.loadingPromise.then(() => {
				this.item.selected = false;
			});
		}
	}

	draw() {
		if (this.item) {
			this._draw();
		} else if (this.loadingPromise) {
			this.loadingPromise.then(() => {
				this._draw();
			});
		}
	}

	_draw() {
		this.item.position = this.position;
		this.item.scale(this.diameter / this.item.bounds.width);
		this.item.visible = true;
	}

	hide() {
		this.item.visible = false;
	}
}

class Vector {
	constructor(position, item, id) {
		this.vector = new paper.Point(position);
		this.force = new paper.Point(0, 0);
		this.prevRot = 0;
		this.id = id;
		this.K = 400;
		self.prevScale = 1;
		this.item = item.clone();
		this.item.onMouseEnter = this.onEnter.bind(this);
		this.item.onMouseLeave = this.onLeave.bind(this);
		this.hide();
	}

	onEnter() {
		this.item.fillColor = "red";

		const infoBox = document.getElementById("infoBox");
		if (infoBox.classList.contains("hidden")) {
			infoBox.classList.remove("hidden");
		}

		const title = document.getElementById("infoTitle");
		title.innerHTML = "Vector";

		const info1 = document.getElementById("iline1");
		info1.innerHTML = "ID: " + this.id;
		const info2 = document.getElementById("iline2");
		info2.innerHTML = "Position: (" + this.vector.x.toFixed(0) + ", " + this.vector.y.toFixed(0) + ")";
		const info3 = document.getElementById("iline3");
		info3.innerHTML = "Magnitude: " + (this.K * this.force.length).toFixed(2);
		const info4 = document.getElementById("iline4");
		info4.innerHTML = "Angle: " + this.force.angle.toFixed(2) + "°";
	}

	onLeave() {
		this.item.fillColor = "black";

		const infoBox = document.getElementById("infoBox");
		if (!infoBox.classList.contains("hidden")) {
			infoBox.classList.add("hidden");
		}
	}

	hide() {
		this.item.visible = false;
	}

	draw() {
		if (this.item) {
			this._draw();
		} else if (this.loadingPromise) {
			this.loadingPromise.then(() => {
				this._draw();
			});
		}
	}

	_draw() {
		this.item.position = this.vector;
		this.item.rotate(this.force.angle - this.prevRot);
		this.prevRot = this.force.angle;
		this.item.scale((this.K * Math.pow(this.force.length, 0.35)) / this.item.bounds.height / self.prevScale);
		self.prevScale = (this.K * Math.pow(this.force.length, 0.35)) / this.item.bounds.height;
		this.item.visible = true;
		this.item.sendToBack();
	}

	calculate(pointCharges) {
		this.force = new paper.Point(0, 0);

		pointCharges.forEach((pointCharge) => {
			let distanceVector = pointCharge.position.subtract(this.vector);
			let distanceSquared = distanceVector.length ** 2;

			// if (distanceVector.length > pointCharge.diameter / 2) {
			let forceMagnitude = pointCharge.charge / distanceSquared;
			let forceVector = distanceVector.normalize().multiply(-forceMagnitude);
			this.force = this.force.add(forceVector);
			// } else {
			// this.force = new paper.Point(0, 0);
			// return;
			// }
		});
	}

	delete() {
		this.item.remove();
	}
}

class VectorField {
	constructor() {
		this.vectors = [];
		this.gap = 50;
		this.load();
	}

	load() {
		paper.project.importSVG("assets/vector.svg", (item) => {
			let count = 0;
			for (let x = 0; x < WIDTH; x += this.gap) {
				for (let y = 0; y < HEIGHT; y += this.gap) {
					this.vectors.push(new Vector(new paper.Point(x, y), item, count));
					count++;
				}
			}
			item.remove();
		});
	}

	update(pointCharges) {
		document.body.style.cursor = "wait";

		for (let vector of this.vectors) {
			vector.calculate(pointCharges);
		}
		document.body.style.cursor = "default";
	}

	draw() {
		for (let vector of this.vectors) {
			vector.draw();
		}
	}

	delete() {
		for (let vector of this.vectors) {
			vector.delete();
		}
	}

	setGap(gap) {
		this.gap = gap;
		this.delete();
		this.vectors = [];
		this.load();
	}

	setK(k) {
		for (let vector of this.vectors) {
			vector.K = k;
		}
		this.draw();
	}
}

function setup() {
	field = new VectorField();
	pointCharges = [];

	const tool = new paper.Tool();
	tool.onMouseDown = (event) => {
		selected?.deselect();
	};

	document.getElementById("add").addEventListener("click", () => {
		selected?.deselect();
		const p = new PointCharge();
		pointCharges.push(p);
		p.draw();
		p.onClick();
		field.update(pointCharges);
		field.draw();
	});

	document.getElementById("view").addEventListener("click", () => {
		for (let i = 0; i < pointCharges.length; i++) {
			pointCharges[i].hide();
			pointCharges.pop(0);
		}
		field.setGap(field.gap);
		// const view = document.getElementById("view");
		// if (view.classList.contains("showing")) {
		// 	for (let p of pointCharges) {
		// 		p.hide();
		// 	}
		// 	view.classList.remove("showing");
		// 	view.innerHTML = "Show Points";
		// } else {
		// 	for (let p of pointCharges) {
		// 		p.draw();
		// 	}
		// 	view.classList.add("showing");
		// 	view.innerHTML = "Hide Points";
		// }
	});

	const density = document.getElementById("density");
	const densityVal = document.getElementById("density-value");

	updateSlider = () => {
		const thumbWidth = 25;
		const sliderWidth = density.offsetWidth - thumbWidth;
		const percent = (density.value - density.min) / (density.max - density.min);
		const offset = percent * sliderWidth;
		densityVal.style.left = `${offset + thumbWidth / 2}px`;
		densityVal.textContent = density.value;
	};

	density.addEventListener("input", updateSlider);
	updateSlider();

	const densityButton = document.getElementsByClassName("density-button")[0];
	densityButton.addEventListener("click", () => {
		densityButton.innerHTML = "Current Vector Density: " + density.value;
		field.setGap(653.46 * Math.pow(density.value, -0.298263) - 153.46);
	});

	const size = document.getElementById("size");
	const sizeVal = document.getElementById("size-value");

	updateSlider = () => {
		const thumbWidth = 25;
		const sliderWidth = size.offsetWidth - thumbWidth;
		const percent = (size.value - size.min) / (size.max - size.min);
		const offset = percent * sliderWidth;
		sizeVal.style.left = `${offset + thumbWidth / 2}px`;
		sizeVal.textContent = size.value;
	};

	size.addEventListener("input", updateSlider);
	updateSlider();

	const sizeButton = document.getElementsByClassName("size-button")[0];
	sizeButton.addEventListener("click", () => {
		sizeButton.innerHTML = "Current Vector Size: " + size.value;
		field.setK(6784900 / (2.12199 * Math.pow(101 - size.value, 2) + 201.781 * (101 - size.value) + 1492.31));
		field.update();
		field.draw();
	});
}

function openDialog() {
	const dialog = document.getElementById("dialogBox");
	dialog.classList.remove("hidden");

	const label = document.getElementById("label");
	label.value = selected?.label || "";
	label.addEventListener("input", (event) => {
		selected.label = event.target.value;
	});

	const charge = document.getElementById("charge");
	charge.value = selected?.charge || "";
	charge.addEventListener("input", (event) => {
		selected.setCharge(event.target.value);
		selected.draw();
		field.update(pointCharges);
		field.draw();
	});

	const diameter = document.getElementById("diameter");
	diameter.value = selected?.diameter || "";
	diameter.addEventListener("input", (event) => {
		selected.diameter = event.target.value;
		selected.draw();
	});

	const locked = document.getElementById("locked");
	locked.checked = selected?.locked || false;
	locked.addEventListener("click", () => {
		selected.locked = !selected.locked;
	});

	document.getElementById("delete").addEventListener("click", () => {
		pointCharges = pointCharges.filter((p) => p !== selected);
		selected?.hide();
		field.update(pointCharges);
		field.draw();
		selected = null;
		const dialog = document.getElementById("dialogBox");
		dialog.classList.add("hidden");
	});
}

function closeDialog() {
	const dialog = document.getElementById("dialogBox");
	dialog.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", setup);
window.addEventListener("resize", () => {
	paper.view.viewSize = [window.innerWidth, window.innerHeight];
	WIDTH = paper.view.size.width;
	HEIGHT = paper.view.size.height;
	field.setGap(field.gap);
});
