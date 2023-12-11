// Initial setup
var tool = new Tool();
var pointCharges = [];
var density = 50;
var field = [];

// Function to add a point charge
function addPointCharge() {
	var position = [Math.random() * 100 - 50 + project.view.center.x, Math.random() * 100 - 50 + project.view.center.y];
	pointCharges.push({ position: new Point(position), charge: 1, diameter: 50, locked: false, label: "" });
}

function calculateVector(position, pointCharges) {
	var vector = new Point(0, 0);

	for (var i = 0; i < pointCharges.length; i++) {
		var pointCharge = pointCharges[i];
		var distance = position.getDistance(pointCharge.position);
		var direction = (pointCharge.position - position).normalize();
		var fieldStrength = (pointCharge.charge / Math.pow(distance, 2)) * 10000;

		vector += direction * fieldStrength;
	}

	vector.angle = (position + vector - position).angle;

	return vector;
}

// Function to draw the electric field
function drawField() {
	// Clear the existing field
	project.activeLayer.children.forEach(function (child) {
		child.remove();
	});

	// Logic to draw the electric field based on point charges
	for (var y = 0; y < project.view.size.height; y += density) {
		for (var x = 0; x < project.view.size.width; x += density) {
			var position = new Point(x, y);
			var vector = calculateVector(position, pointCharges);
			console.log(vector);

			// if (fieldStrength.length > 0) {
			// 	drawVector(position, vector);
			// }
		}
	}
	for (var i = 0; i < pointCharges.length; i++) {
		console.log(pointCharges[i]);
		var pointCharge = pointCharges[i];
		var position = pointCharge.position;
		var charge = pointCharge.charge;
		var diameter = pointCharge.diameter;

		if (charge < 0) {
			project.importSVG("assets/negative.svg", function (item) {
				item.position = position;
				item.scale(diameter / item.bounds.width);
			});
		} else {
			project.importSVG("assets/positive.svg", function (item) {
				item.position = position;
				item.scale(diameter / item.bounds.width);
			});
		}
	}
}

function drawVector(start, end) {
	// calculate distance between points
	var distance = start.getDistance(end);
	// make sure it is not lower than diagonal
	if (distance < DIAGONAL) {
		distance = DIAGONAL;
	}

	// draw rectangles
	var directionRectangle = new Path.Rectangle(new Point(0, -STROKE_WIDTH), new Point(distance - DIAGONAL, STROKE_WIDTH));
	var topRectangle = new Path.Rectangle(new Point(0, -STROKE_WIDTH), new Point(HEAD_LENGTH, STROKE_WIDTH));

	// move top rectangle to the right
	topRectangle.translate(directionRectangle.bounds.rightCenter - topRectangle.bounds.rightCenter + [WIDTH, 0]);

	// make bottom rectangle by cloning top one
	var bottomRectangle = topRectangle.clone();

	// offset top and bottom rectangles
	topRectangle.position -= [0, STROKE_WIDTH];
	bottomRectangle.position += [0, STROKE_WIDTH];

	// rotate then to form arrow head
	topRectangle.rotate(45, topRectangle.bounds.bottomRight - [WIDTH, 0]);
	bottomRectangle.rotate(-45, bottomRectangle.bounds.topRight - [WIDTH, 0]);

	// join the 3 rectangles into one path
	var arrow = directionRectangle.unite(topRectangle).unite(bottomRectangle);

	// move and rotate this path to fit start / end positions
	arrow.translate(start - directionRectangle.bounds.leftCenter);
	arrow.rotate((end - start).angle, start);

	// apply custom styling
	arrow.style = STYLE;

	directionRectangle.remove();
	topRectangle.remove();
	bottomRectangle.remove();
}

// Event listener for the button
document.getElementById("add").addEventListener("click", function () {
	// Show dialog box for adding point charge
	// ...
	addPointCharge();
});

// Tool event to handle canvas interaction
tool.onMouseDown = function (event) {
	addPointCharge();
	drawField();
};
