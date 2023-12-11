paper.setup("canvas");

let WIDTH = paper.view.size.width;
let HEIGHT = paper.view.size.height;
let field;
let pointCharges;

function random(min, max) {
	return Math.random() * (max - min) + min;
}

class PointCharge {
	INIT_RANGE = 0.5; // middle 50%
	DIAMETER = 50;

	constructor() {
		this.position = new paper.Point(
			random((WIDTH * (1 - this.INIT_RANGE)) / 2, (WIDTH * (1 + this.INIT_RANGE)) / 2),
			random((HEIGHT * (1 - this.INIT_RANGE)) / 2, (HEIGHT * (1 + this.INIT_RANGE)) / 2)
		);
		this.setCharge(random(0, 1) > 0.5 ? 1 : -1);
		this.locked = false;
		this.label = "";
	}

	setPosition(x, y) {
		this.position = new paper.Point(x, y);
	}

	setCharge(charge) {
		this.charge = charge;
		const path = "assets/" + (charge < 0 ? "negative" : "positive") + ".svg";

		this.loadingPromise = new Promise((resolve, reject) => {
			paper.project.importSVG(path, (item) => {
				if (item) {
					this.item = item;
					this.hide();
					resolve();
				} else {
					console.error("Failed to load SVG:", path);
					reject("Failed to load SVG");
				}
			});
		});
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
		this.item.scale(this.DIAMETER / this.item.bounds.width);
		this.item.visible = true;
	}

	hide() {
		this.item.visible = false;
	}
}

class Vector {
	K = 1000;

	constructor(position, item, id) {
		this.vector = new paper.Point(position);
		this.force = new paper.Point(0, 0);
		this.id = id;
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
		this.item.rotation = this.force.angle;
		this.item.scale((this.K * Math.sqrt(this.force.length)) / this.item.bounds.height);
		this.item.visible = true;
		this.item.sendToBack();
	}

	calculate(pointCharges) {
		let netForce = new paper.Point(0, 0);

		pointCharges.forEach((pointCharge) => {
			let distanceVector = pointCharge.position.subtract(this.vector);
			let distanceSquared = distanceVector.length ** 2;

			if (distanceVector.length > pointCharge.DIAMETER / 2) {
				let forceMagnitude = pointCharge.charge / distanceSquared;
				let forceVector = distanceVector.normalize().multiply(forceMagnitude);
				netForce = netForce.add(forceVector);
			}
		});

		this.force = netForce;
	}

	delete() {
		this.item.remove();
	}
}

class VectorField {
	GAP = 50;

	constructor() {
		this.vectors = [];
		this.load();
	}

	async load() {
		paper.project.importSVG("assets/vector.svg", (item) => {
			let count = 0;
			for (let x = 0; x < WIDTH; x += this.GAP) {
				for (let y = 0; y < HEIGHT; y += this.GAP) {
					this.vectors.push(new Vector(new paper.Point(x, y), item, count));
					count++;
				}
			}
			item.remove();
		});
	}

	update(pointCharges) {
		for (let vector of this.vectors) {
			vector.calculate(pointCharges);
		}
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
}

function setup() {
	field = new VectorField();
	pointCharges = [];

	setupHandlers();
}

function setupHandlers() {
	const tool = new paper.Tool();
	tool.onMouseDown = function (event) {
		const p = new PointCharge();
		pointCharges.push(p);
		p.setPosition(event.point.x, event.point.y);
		p.draw();
		field.update(pointCharges);
		field.draw();
	};
}

document.addEventListener("DOMContentLoaded", setup);
window.addEventListener("resize", () => {
	paper.view.viewSize = [window.innerWidth, window.innerHeight];
	WIDTH = paper.view.size.width;
	HEIGHT = paper.view.size.height;
	field.delete();
	field = new VectorField();
});
