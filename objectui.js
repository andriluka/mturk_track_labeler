// MA
function ma_assert(cond, msg) {
    if (cond) {
	window.alert(msg);
	console.log(msg);
    }
}

function rect_int(r1, r2) {

    if (r1[0] >= r2[2])
	return 0;

    if (r1[2] <= r2[0])
	return 0;

    if (r1[1] >= r2[3])
	return 0;

    if (r1[3] <= r2[1])
	return 0;

    var l = Math.max(r1[0], r2[0]);
    var t = Math.max(r1[1], r2[1]);
    var r = Math.min(r1[2], r2[2]);
    var b = Math.min(r1[3], r2[3]);

    return (r - l)*(b - t);
}

function rect_iou(r1, r2) {
    ma_assert(r1[0] <= r1[2], "broken rectangle struct");
    ma_assert(r1[1] <= r1[3], "broken rectangle struct");

    ma_assert(r2[0] <= r2[2], "broken rectangle struct");
    ma_assert(r2[1] <= r2[3], "broken rectangle struct");

    var a1 = (r1[2] - r1[0])*(r1[3] - r1[1]);
    var a2 = (r2[2] - r2[0])*(r2[3] - r2[1]);

    var ia = rect_int(r1, r2)
    return  ia / (a1 + a2 - ia);
}

function ui_update_bonus_display(num_objects, object_bonus_usd)
{
    if (object_bonus_usd > 0) {
	current_bonus = object_bonus_usd * num_objects;
        bonus_counter_html = "<p align='center'>Bonus for labeled objects:<br><font color='DarkOrange'>" + current_bonus.toFixed(2) + " USD</font></p>";
	$("#bonus_counter").html(bonus_counter_html);
    }
}

function count_bonus_objects(job, track_collection)
{
    var new_bonus_object_count = 0;

    // don't pay bonus for new annotations smaller than minimal size
    var min_box_width = job.min_box_width;

    var new_pos = [];
    var preloaded_pos = [];
    var preloaded_matched = [];

    // threshold to define when the new annotation is too similar -> no bonus
    var iou_too_similar_threshold = 0.75;

    // threshold to define when new and old annotations match
    var iou_matched_threshold = 0.5;

    for (var idx = 0; idx < track_collection.tracks.length; ++idx) {
	if (!track_collection.tracks[idx].deleted) {
	    var newidx = new_pos.length;
	    var cur_pos = track_collection.tracks[idx].pollposition();
	    new_pos[newidx] = [cur_pos.xtl, cur_pos.ytl, cur_pos.xbr, cur_pos.ybr];
	}

	if (track_collection.tracks[idx].preloaded_pos.length > 0) {
	    var preidx = preloaded_pos.length;
	    preloaded_pos[preidx] = track_collection.tracks[idx].preloaded_pos;
	    preloaded_matched[preidx] = 0;
	}
    }
    //console.log("new_pos.length: " + new_pos.length);

    for (var idx = 0; idx < new_pos.length; ++idx) {
	var cur_width = Math.abs(new_pos[idx][2] - new_pos[idx][0]);

	var max_iou = 0;
	var max_preidx = -1;
	for (var preidx = 0; preidx < preloaded_pos.length; ++preidx) {
	    if (preloaded_matched[preidx] == 1)
		continue;

	    var cur_iou = rect_iou(new_pos[idx], preloaded_pos[preidx]);

	    if (cur_iou > max_iou) {
		max_iou = cur_iou;
		max_preidx = preidx;
	    }
	}

	if (max_iou > iou_matched_threshold) {
	    preloaded_matched[max_preidx] = 1;

	    // matched, but sifficiently different -> pay bonus
	    if (max_iou < iou_too_similar_threshold && cur_width > min_box_width)
		++new_bonus_object_count;
	}
	else {
	    // didn't match to preloaded -> pay bonus
	    if (cur_width > min_box_width)
		++new_bonus_object_count;
	}
    }

    // pay bonus for deleted false positives -> preloaded annotation that didn't match any new one
    for (var preidx = 0; preidx < preloaded_matched.length; ++preidx) {
	if (preloaded_matched[preidx] == 0)
	    ++new_bonus_object_count;
    }

    job.bonus_object_count = new_bonus_object_count;
    return new_bonus_object_count;
}

function TrackObjectUI(button, container, videoframe, job, player, tracks)
{
    var me = this;

    this.button = button;
    this.container = container;
    this.videoframe = videoframe;
    this.job = job;
    this.player = player;
    this.tracks = tracks;

    var do_predict_box = (job.camidx >= 0);
    this.drawer = new BoxDrawer(videoframe, do_predict_box);

    this.counter = 0;

    this.currentobject = null;
    this.currentcolor = null;

    this.objects = [];

    this.startnewobject = function()
    {
        if (this.button.button("option", "disabled"))
        {
            return;
        }

        tracks.drawingnew(true);

        console.log("Starting new track object");

        eventlog("newobject", "Start drawing new object");

        //this.instructions.fadeOut();

        this.currentcolor = this.pickcolor();
        this.drawer.color = this.currentcolor[0];
        this.drawer.enable();

        this.button.button("option", "disabled", true);

        this.currentobject = new TrackObject(this.job, this.player,
                                             this.container,
                                             this.currentcolor);
        this.currentobject.statedraw();

        this.tracks.resizable(false);
        this.tracks.draggable(false);
    }


    /*
     * Method called when we receive a click on the target area.
     */

    function dotprod(x1, x2) 
    {
    	ma_assert(x1.length == x2.length);
	var res = 0;

	for (var idx = 0; idx < x1.length; ++idx)
	    res += x1[idx]*x2[idx];

	return res;
    }
    
    function predict_box(xc, yc) 
    {
	// MA: 
	// 0: sears, 
	// 1: mission bay 360, 1280x1280, 
	// 2: gap cam03 in hillsdale
	// 3: gap pvm ~ "Entrance", 1280x
	// 4: gap wm (new)
	// 5: athleta-townandcountry
	var w_cams = [
	    [[-7.672041918747931, 1.0175067911024558, -0.06590469040374715, -7.211280247984336e-05, 0.00012771147864107607, 1.477529485324053e-05, 8.020388243953555e-08, -4.341880717462221e-07], [-10.917894545401326, 0.032551186687820415, 0.9915173195310345, -0.00011444394152173958, -0.0004821829954749597, -8.071634820381278e-06, 1.2617700063249915e-07, 1.1268500293981631e-06], [7.672041977916478, 0.982493209014998, 0.06590469047041211, 7.211280204022822e-05, -0.00012771147863909675, -1.4775294880859009e-05, -8.020388248463836e-08, 4.341880717600999e-07], [10.917894544272448, -0.032551186679112984, 1.008482680499281, 0.00011444394150978907, 0.00048218299533289537, 8.071634815310681e-06, -1.2617700064637694e-07, -1.1268500295091854e-06]],
	    [[32.16754917484052, 0.8809580740561793, -0.10164541672705144, 0.00011687399557293178, 8.030197168137462e-05, 4.2376165210809645e-06, -2.410636918553921e-08, -5.127424110296097e-09], [33.245060018201364, -0.10818100048100977, 0.8879367108452643, 8.831688001734479e-05, 9.680024218163853e-05, 1.9533507009137708e-06, -6.388489459663305e-09, -1.1284559064961286e-08], [-32.167548696528506, 1.1190419254338313, 0.10164541632320057, -0.00011687399481189304, -8.030197137915738e-05, -4.2376165020611395e-06, 2.410636868593885e-08, 5.1274241519294605e-09], [-33.24506002494341, 0.10818100068318327, 1.1120632897046476, -8.831688020089686e-05, -9.680024271996887e-05, -1.953350696183234e-06, 6.388489293129851e-09, 1.1284558953938983e-08]],
	    [[0.4874187502373933, 0.9438815323923854, -0.002997178937149596, 6.53204373348383e-05, -0.00021865502076448703, 3.2501748396410385e-06, -2.4374515828775277e-08, 2.1123238769672065e-07], [-2.4550309224372464, -0.05014352752288754, 0.9956329527528365, 6.433707908552202e-05, -0.0002297974199932161, -5.550747734570116e-06, -2.7037680538910536e-08, 2.445021393127078e-07], [-0.48741859366169943, 1.0561184677488642, 0.00299717906786916, -6.532043765673898e-05, 0.00021865502071334147, -3.2501748381862564e-06, 2.437451585555507e-08, -2.112323876819755e-07], [2.455030968115854, 0.05014352754567731, 1.0043670473313262, -6.43370791194235e-05, 0.00022979741952009651, 5.55074773028459e-06, 2.703768045564381e-08, -2.445021389796409e-07]],
	    [[4.200504337155643, 0.9500879015575776, -0.07370337082837151, 5.004044763551557e-05, 1.8882467716954752e-05, 8.976036054408865e-06, -1.0061758981549929e-08, -9.46304876126014e-09], [-4.531712648525561, -0.027024942487168847, 0.9762786731527517, 1.5867648614032034e-05, -0.000244969631254174, 1.0763614580744758e-05, 4.89383253018949e-09, 2.904327342891696e-07], [-4.200503264614177, 1.0499120989938298, 0.07370337091580866, -5.004044815248474e-05, -1.8882467812896317e-05, -8.9760360867694e-06, 1.0061758759505324e-08, 9.463048747382352e-09], [4.531712693185687, 0.027024942491943312, 1.023721326728986, -1.586764861968918e-05, 0.0002449696314163281, -1.0763614581061195e-05, -4.893832547536725e-09, -2.9043273447066503e-07]],
	    [[-9.155114497925345, 0.9839847748284203, -0.009039703257387609, 1.5493352883773955e-05, -4.443616306261492e-05, -7.622674291746451e-06, -3.650591495762967e-09, 3.8409216390755674e-08], [-11.047726671268439, -0.015164068000041348, 1.00675460445586, 1.4850759286950718e-05, -0.0001276471567652913, -6.575303466558092e-06, -5.233742559132559e-09, 1.3289973691031978e-07], [9.155114454233871, 1.016015224990166, 0.009039703300698065, -1.549335256509311e-05, 4.443616302593321e-05, 7.622674288604216e-06, 3.6505913847406646e-09, -3.840921633524452e-08], [11.047726649524826, 0.015164067998400378, 0.9932453957282882, -1.4850759279999996e-05, 0.00012764715652170217, 6.575303465588846e-06, 5.233742557397836e-09, -1.3289973693547327e-07]],
	    [[34.68776876349583, 0.8925980104662986, -0.1138074713267876, 7.173834211783461e-05, 9.249388755172344e-05, 8.509642537935045e-07, 6.425728171777223e-09, -7.015638070484442e-10], [37.12348844720696, -0.12727901812024645, 0.9052806215315038, 8.443681533043296e-05, 6.065877420065553e-05, 2.8919978593151255e-06, 5.787493331799176e-09, 1.4243452334250506e-08], [-34.687768066759666, 1.1074019888353515, 0.11380747078232167, -7.173834182788025e-05, -9.249388696088963e-05, -8.509642757938097e-07, -6.4257282827995255e-09, 7.015633629592344e-10], [-37.123488081858255, 0.1272790173645156, 1.0947193778109539, -8.443681481623448e-05, -6.065877346529161e-05, -2.8919978520793634e-06, -5.787493276288025e-09, -1.4243452611806262e-08]]
	];

	ma_assert(job.camidx >= 0, "error: missing camera index");

	if (job.camidx < w_cams.length && w_cams[job.camidx].length > 0) {
	    console.log('using parameters for camera ' + job.camidx);
	    w = w_cams[job.camidx];

    	    var f = [1, xc, yc, xc*xc, yc*yc, xc*yc, xc*xc*xc, yc*yc*yc];

	    var x1 = Math.round(dotprod(w[0], f));
	    var y1 = Math.round(dotprod(w[1], f));

	    var x2 = Math.round(dotprod(w[2], f));
	    var y2 = Math.round(dotprod(w[3], f));

	    console.log("(" + x1 + "," + y1 + ")" + ", (" + x2 + "," + y2 + ")");

	    return new Position(x1, y1, x2, y2);
	}
	else {
	    console.log('camidx: ' + job.camidx); 
	    console.log('num_cams:: ' + w_cams.length); 
	    if (job.camidx < w_cams.length) {
		console.log('num_params:: ' + w_cams[job.camidx].length); 
	    }
	    alert('camera-specific parameters undefined!!!');
	}
    }

    // MA: predicted bounding box 
    this.stopdrawing_predict = function(click_pos)
    {
        console.log("stopdrawing_predict: Received new track object drawing");

	ma_assert(click_pos.length == 2);
	position = predict_box(click_pos[0], click_pos[1]);

        this.currentcolor = this.pickcolor();
        var track = tracks.add(player.frame, position, this.currentcolor[0]);

        this.drawer.disable();
        ui_disable();

        this.currentobject.onready.push(function() {
            me.stopnewobject();
        });

        this.currentobject.initialize(this.counter, track, this.tracks);
        this.currentobject.stateclassify();
    }

    this.stopdrawing = function(position)
    {
        console.log("Received new track object drawing");

        var track = tracks.add(player.frame, position, this.currentcolor[0]);

        this.drawer.disable();
        ui_disable();

        this.currentobject.onready.push(function() {
            me.stopnewobject();
        });

        this.currentobject.initialize(this.counter, track, this.tracks);
        this.currentobject.stateclassify();
    }

    this.stopnewobject = function()
    {
        console.log("Finished new track object");

        ui_enable();
        tracks.drawingnew(false);

        this.objects.push(this.currentobject);

        this.tracks.draggable(true);
        if ($("#annotateoptionsresize:checked").size() == 0)
        {
            this.tracks.resizable(true);
        }
        else
        {
            this.tracks.resizable(false);
        }

        this.tracks.dim(false);
        this.currentobject.track.highlight(false);

	// MA
	var num_objects = me.objects.length;
	f = function() {me.objects[num_objects-1].updateboxtext();}
	this.currentobject.track.onupdate.push(f);
        this.button.button("option", "disabled", false);
        this.counter++;

	// MA
	var new_bonus_object_count = count_bonus_objects(this.job, this.tracks);
	ui_update_bonus_display(new_bonus_object_count, this.job.object_bonus_usd);
    }

    this.injectnewobject = function(label, path, attributes)
    {
        console.log("Injecting existing object");

        //this.instructions.fadeOut();

        this.currentcolor = this.pickcolor();
        var obj = new TrackObject(this.job, this.player,
                                  container, this.currentcolor);

        function convert(box)
        {
            return new Position(box[0], box[1], box[2], box[3],
                                box[6], box[5]);
        }

        var track = tracks.add(path[0][4], convert(path[0]),
                               this.currentcolor[0]);
        for (var i = 1; i < path.length; i++)
        {
            track.journal.mark(path[i][4], convert(path[i]));
        }

        obj.initialize(this.counter, track, this.tracks);
        obj.finalize(label);

        for (var i = 0; i < attributes.length; i++)
        {
            track.attributejournals[attributes[i][0]].mark(attributes[i][1], attributes[i][2]);
            console.log("Injecting attribute " + attributes[i][0] + " at frame " + attributes[i][1] + " to " + attributes[i][2]);
        }

        obj.statefolddown();
        obj.updatecheckboxes();
        obj.updateboxtext();
        this.counter++;

        return obj;
    }

    this.setup = function()
    {
        this.button.button({
            icons: {
                primary: "ui-icon-plusthick",
            },
            disabled: false
        }).click(function() {
            me.startnewobject();
        });

	if (me.job.camidx >= 0) {
	    // MA: predicted bounding box 
            this.drawer.onstopdraw.push(function(position) {
		me.stopdrawing_predict(position);
            });
	}
	else {
            this.drawer.onstopdraw.push(function(position) {
		me.stopdrawing(position);
            });
	}

	// MA
        //var html = "<p>In this video, please track all of these objects:</p>";

	var num_hints = 1;
	var hintidx = Math.floor(Math.random()*num_hints);

	var html = "<div id='bonus_counter'><p align='center'>Bonus for labeled objects:<br><font color='DarkOrange'>0.00 USD</font></p></div>";

        html += "<p align='center'>Keyboard shortcuts: <font color='blue'>'n'</font> - new vehicle, <font color='blue'>'t'</font> - toggle between partially and fully visible state, <font color='blue'>'d'</font> - delete vehicle.</p><br>";

	// MA: ETH dataset 
	// if (hintidx == 0) {
	//     html += "<p align='center'><font color='green'>Hint</font>: label people with bounding boxes. Don't label tiny people that are smaller than minimal box size. If person is partially outside of the image then label the visible part. </p><p align='center'><img width = '200px' src='label_cars_instructions/eth_mturk1.jpg'/></p><p align='center'><img width = '200px' src='label_cars_instructions/eth_mturk2.jpg'/></p>";
	// }

	// MA: labeling people heads in retail data
	if (hintidx == 0) {
	    html += "<p align='center'><font color='green'>Hint</font>: label people with bounding boxes around the person's head. Don't label tiny people that are smaller than minimal box size.</p><p align='center'><img width = '200px' src='label_cars_instructions/supermarket_hint1.jpg'/></p><p align='center'><img width = '200px' src='label_cars_instructions/supermarket_hint2.jpg'/></p>";
	}

	// if (hintidx == 0) {
	//     html += "<p align='center'><font color='green'>Hint</font>: label all vehicles with annotation rectangle wider than <strong>20 pixels</strong>. Width is indicated at the top of each annotation:</p><p align='center'><img width = '200px' src='label_cars_instructions/label_small_30px_missing2.png'/></p><p align='center'><img width = '200px' src='label_cars_instructions/label_small_30px_correct2.png'/></p>";
	// }
	

	// else if (hintidx == 1) {
        //     html += "<p align='center'><font color='green'>Hint</font>: labeling boxes should tightly enclose the vehicle:<br><img width = '200px' src='label_cars_instructions/box_precise.png'/><img width = '200px' src='label_cars_instructions/box_loose.png'/></p>";
	// }
	// else if (hintidx == 2) {
	//     html += "<p align='center'><font color='green'>Hint</font>: labeling box for the partially visible vehicle should include the whole vehicle, not just the visible part:<br><img width = '200px' src='label_cars_instructions/occluded_all.png'/><img width = '200px' src='label_cars_instructions/occluded_visible_only.png'/></p>";
	// }
	// else if (hintidx == 3) {
	//     html += "<p align='center'><font color='green'>Hint</font>: you may skip barely visible vehicles at a distance, but you should label all other vehicles:<br><img width = '200px' src='label_cars_instructions/missed_none.png'/><img width = '200px' src='label_cars_instructions/missed_car.png'/></p>";
	// }
	// else if (hintidx == 4) {
	//     html += "<p align='center'><font color='green'>Hint</font>: label all types of vehicles including motorcycles, buses and trucks:<br><img width = '200px' src='label_cars_instructions/type6.jpeg'/><img width = '200px' src='label_cars_instructions/type1.jpeg'/></p>";
	// }
	// else if (hintidx == 5) {
	//     html += "<p align='center'><font color='green'>Hint</font>: When looking at cars from a side angle, label all cars, even if they are traveling in different directions. :<br><img width = '200px' src='label_cars_instructions/side_car1.jpeg'/><img width = '200px' src='label_cars_instructions/side_car2.jpeg'/></p>";
	// }
	// else if (hintidx == 6) {
	//     html += "<p align='center'><font color='green'>Hint</font>: When you are unsure about what should be labeled, please send an email with a screenshot of the image in question to stanfordamtteam@gmail.com. </p>";
	// }
	// // else if (hintidx == 7) {
	// //     html += "<p align='center'><font color='green'>Hint</font>: If you get an image with green boxes already in the image, then only label the missing cars without boxes. </p>";
	// // }
	// else if (hintidx == 7) {
	//     html += "<p align='center'><font color='green'>Hint</font>: Do not label the car that the camera is on. :<br><img width = '200px' src='label_cars_instructions/back_of_car.jpeg'/></p>";
	// }
	// // else if (hintidx == 7) {
	// //     html += "<p align='center'><font color='green'>Hint</font>: Label all cars you see within an image. Do not label a car if you can't see the majority of its hood or its rear tail lights. :<br><img width = '200px' src='label_cars_instructions/all_directions_hint1.jpeg'/><img width = '200px' src='label_cars_instructions/all_directions_hint2.jpeg'/></p>";
	// // }
	// else if (hintidx == 8) {
	//     html += "<p align='center'><font color='green'>Hint</font>: Only label cars in the opposite lane if they are obviously a car. :<br><img width = '300px' src='label_cars_instructions/dark_car.jpeg'/></p>";
	// }
	// // else if (hintidx == 8) {
	// //     html += "<p align='center'><font color='green'>Hint</font>: Do not label cars if you can only see the top of the roof, or if they blend in heavily with the background. :<br><img width = '200px' src='label_cars_instructions/dont_label_roof.jpeg'/></p>";
	// // }
	// else if (hintidx == 9) {
	//     html += "<p align='center'><font color='green'>Hint</font>: Label ALL vehicles in the image not masked out. Do not label masked out vehicles. :<br><img width = '300px' src='label_cars_instructions/masked_cars.jpeg'/></p>";
	// }


        //html += "<p>In this image, please label all of these objects:</p>";

        // html += "<ul>";
        // for (var i in this.job.labels)
        // {
        //     html += "<li>" + this.job.labels[i] + "</li>";
        // }
        // html += "</ul>";

        this.instructions = $(html).appendTo(this.container);
    }

    this.disable = function()
    {
        for (var i in this.objects)
        {
            this.objects[i].disable();
        }
    }

    this.enable = function()
    {
        for (var i in this.objects)
        {
            this.objects[i].enable();
        }
    }

    this.setup();

    this.availcolors = [["#FF00FF", "#FFBFFF", "#FFA6FF"],
                        ["#FF0000", "#FFBFBF", "#FFA6A6"],
                        ["#FF8000", "#FFDCBF", "#FFCEA6"],
                        ["#FFD100", "#FFEEA2", "#FFEA8A"],
                        ["#008000", "#8FBF8F", "#7CBF7C"],
                        ["#0080FF", "#BFDFFF", "#A6D2FF"],
                        ["#0000FF", "#BFBFFF", "#A6A6FF"],
                        ["#000080", "#8F8FBF", "#7C7CBF"],
                        ["#800080", "#BF8FBF", "#BF7CBF"]];

    this.pickcolor = function()
    {
        return this.availcolors[this.availcolors.push(this.availcolors.shift()) - 1];
    }
}

function TrackObject(job, player, container, color)
{
    var me = this;

    this.job = job;
    this.player = player;
    this.container = container;
    this.color = color;

    this.id = null;
    this.track = null;
    this.tracks = null;
    this.label = null;

    this.onready = [];
    this.onfolddown = [];
    this.onfoldup = [];

    this.handle = $("<div class='trackobject'><div>");
    this.handle.prependTo(container);
    this.handle.css({
        'background-color': color[2],
        'border-color': color[2]});
    this.handle.mouseover(function() {
        me.mouseover();
    });
    this.handle.mouseout(function() {
        me.mouseout();
    });

    this.header = null;
    this.headerdetails = null;
    this.details = null;
    this.drawinst = null;
    this.classifyinst = null;
    this.opencloseicon = null;

    this.ready = false;
    this.foldedup = false;

    this.tooltip = null;
    this.tooltiptimer = null;

    this.initialize = function(id, track, tracks)
    {
        this.id = id;
        this.track = track;
        this.tracks = tracks;

        this.track.onmouseover.push(function() {
            me.mouseover();
        });

        this.track.onmouseout.push(function() {
            me.mouseout();
            me.hidetooltip();
        });

        this.track.onstartupdate.push(function() {
            me.hidetooltip();
        });

        this.player.onupdate.push(function() {
            me.hidetooltip();
        });

        this.track.oninteract.push(function() {
            var pos = me.handle.position().top + me.container.scrollTop() - 30;
            pos = pos - me.handle.height();
            me.container.stop().animate({scrollTop: pos}, 750);

            me.toggletooltip();
        });

        this.track.onupdate.push(function() {
            me.hidetooltip();
            eventlog("interact", "Interact with box " + me.id);
        });

        this.track.notifyupdate();
        eventlog("newobject", "Finished drawing new object");
    }

    this.remove = function()
    {
        this.handle.slideUp(null, function() {
            me.handle.remove();
        });
        this.track.remove();

	// MA
	var new_bonus_object_count = count_bonus_objects(this.job, this.tracks);
	ui_update_bonus_display(new_bonus_object_count, this.job.object_bonus_usd);
    }

    this.statedraw = function()
    {
        var html = "<p>Draw a box around one of these objects:</p>";

        html += "<ul>";
        for (var i in this.job.labels)
        {
            html += "<li>" + this.job.labels[i] + "</li>";
        }
        html += "</ul>";
        html += "<p>Do not annotate the same object twice.</p>";

        this.drawinst = $("<div>" + html + "</div>").appendTo(this.handle);
        this.drawinst.hide().slideDown();

        this.container.stop().animate({scrollTop: 0}, 750);

    }

    this.stateclassify = function()
    {
        this.drawinst.slideUp(null, function() {
            me.drawinst.remove();
        });

        var length = 0;
        var firsti = 0;
        for (var i in this.job.labels)
        {
            length++;
            firsti = i;
        }

        if (length == 1)
        {
            this.finalize(firsti);
            this.statefolddown();
        }
        else
        {
            var html = "<p>What type of object did you just annotate?</p>";
            for (var i in job.labels)
            {
                var id = "classification" + this.id + "_" + i;
                html += "<div class='label'><input type='radio' name='classification" + this.id + "' id='" + id + "'> <label for='" + id + "'>" + job.labels[i] + "</label></div>";
            }

            this.classifyinst = $("<div>" + html + "</div>").appendTo(this.handle);
            this.classifyinst.hide().slideDown();

            $("input[name='classification" + this.id + "']").click(function() {
                me.classifyinst.slideUp(null, function() {
                    me.classifyinst.remove();
                });

                for (var i in me.job.labels)
                {
                    var id = "classification" + me.id + "_" + i;
                    if ($("#" + id + ":checked").size() > 0)
                    {
                        me.finalize(i);
                        me.statefolddown();
                        break;
                    }
                }

            });
        }
    }

    this.finalize = function(labelid)
    {
	//console.log("finalize: " + labelid);

        this.label = labelid;
        this.track.label = labelid;

        this.headerdetails = $("<div style='float:right;'></div>").appendTo(this.handle);

        this.header = $("<p class='trackobjectheader'><strong>" + this.job.labels[this.label] + " " + (this.id + 1) + "</strong></p>").appendTo(this.handle).hide().slideDown();

        //this.opencloseicon = $('<div class="ui-icon ui-icon-triangle-1-e"></div>').prependTo(this.header);
        this.details = $("<div class='trackobjectdetails'></div>").appendTo(this.handle).hide();

        this.setupdetails();

        this.updateboxtext();

        this.track.initattributes(this.job.attributes[this.track.label]);

        this.header.mouseup(function() {
            me.click();
        });

        this.ready = true;
        this._callback(this.onready);

        this.player.onupdate.push(function() {
            me.updateboxtext();
        });
    }

    this.updateboxtext = function()
    {
	// MA
        //var str = "<strong>" + this.job.labels[this.label] + " " + (this.id + 1) + "</strong>";
	var pos = this.track.pollposition();
	//var str = "<strong>id: " + (this.id + 1) + "<br>w: " + Math.round(pos.width) + "</strong>";
	var str = "<strong>w: " + Math.round(pos.width) + "</strong>";

        var count = 0;
        for (var i in this.job.attributes[this.track.label])
        {
            if (this.track.estimateattribute(i, this.player.frame))
            {
                str += "<br>";
                str += this.job.attributes[this.track.label][i];
                count++;
            }
        }

        this.track.settext(str);

        if ($("#annotateoptionshideboxtext").attr("checked"))
        {
            $(".boundingboxtext").hide();
        }

	// MA: update bonus if width changed
	var new_bonus_object_count = count_bonus_objects(this.job, this.tracks);
	ui_update_bonus_display(new_bonus_object_count, this.job.object_bonus_usd);
    }

    this.setupdetails = function()
    {
	// MA
        //this.details.append("<input type='checkbox' id='trackobject" + this.id + "lost'> <label for='trackobject" + this.id + "lost'>Outside of view frame</label><br>");

	// MA: not showing the visible/hidden checkbox for now
        this.details.append("<div style='display:none'><input type='checkbox' id='trackobject" + this.id + "occluded'> <label for='trackobject" + this.id + "occluded'>Occluded or truncated</label><br></div>");

        for (var i in this.job.attributes[this.track.label])
        {
            this.details.append("<input type='checkbox' id='trackobject" + this.id + "attribute" + i + "'> <label for='trackobject" + this.id + "attribute" + i +"'>" + this.job.attributes[this.track.label][i] + "</label><br>");

            // create a closure on attributeid
            (function(attributeid) {

                $("#trackobject" + me.id + "attribute" + i).click(function() {
                    me.player.pause();

                    var checked = $(this).attr("checked");
                    me.track.setattribute(attributeid, checked ? true : false);
                    me.track.notifyupdate();

                    me.updateboxtext();

                    if (checked)
                    {
                        eventlog("markattribute", "Mark object as " + me.job.attributes[me.track.label][attributeid]);
                    }
                    else
                    {
                        eventlog("markattribute", "Mark object as not " + me.job.attributes[me.track.label][attributeid]);
                    }
                });

            })(i);
        }


        $("#trackobject" + this.id + "lost").click(function() {
            me.player.pause();

            var outside = $(this).attr("checked");
            me.track.setoutside(outside);
            me.track.notifyupdate();

            if (outside)
            {
                eventlog("markoutside", "Mark object outside");
            }
            else
            {
                eventlog("markoutside", "Mark object inside");
            }
        });

	// MA
        $("#trackobject" + this.id + "occluded").click(function() {
	    console.log("occluded click handler");

            // me.player.pause();

            var occlusion = $(this).attr("checked");
	    console.log("click handler, occlusion: " + occlusion);

            // me.track.setocclusion(occlusion);
            // me.track.notifyupdate();

            // if (occlusion)
            // {
            //     eventlog("markocclusion", "Mark object as occluded");
            // }
            // else
            // {
            //     eventlog("markocclusion", "Mark object as not occluded");
            // }
        });

        this.player.onupdate.push(function() {
            me.updatecheckboxes();
        });

        //this.details.append("<br><input type='button' id='trackobject" + this.id + "label' value='Change Type'>");
        this.headerdetails.append("<div style='float:right;'><div class='ui-icon ui-icon-trash' id='trackobject" + this.id + "delete' title='Delete this track'></div></div>");
        this.headerdetails.append("<div style='float:right;'><div class='ui-icon ui-icon-unlocked' id='trackobject" + this.id + "lock' title='Lock/unlock to prevent modifications'></div></div>");
        this.headerdetails.append("<div style='float:right;'><div class='ui-icon ui-icon-image' id='trackobject" + this.id + "tooltip' title='Show preview of track'></div></div>");

        $("#trackobject" + this.id + "delete").click(function() {
	    // MA
            //if (window.confirm("Delete the " + me.job.labels[me.label] + " " + (me.id + 1) + " track? If the object just left the view screen, click the \"Outside of view frame\" check box instead."))

	    if (window.confirm("Delete the " + me.job.labels[me.label] + " " + (me.id + 1) + "?"))
            {
                me.remove();
                eventlog("removeobject", "Deleted an object");
            }
        });

        $("#trackobject" + this.id + "lock").click(function() {
            if (me.track.locked)
            {
                me.track.setlock(false);
                $(this).addClass("ui-icon-unlocked").removeClass("ui-icon-locked");
            }
            else
            {
                me.track.setlock(true);
                $(this).removeClass("ui-icon-unlocked").addClass("ui-icon-locked");
            }
        });

        $("#trackobject" + this.id + "tooltip").click(function() {
            me.toggletooltip(false);
        }).mouseout(function() {
            me.hidetooltip();
        });
    }

    this.updatecheckboxes = function()
    {
        var e = this.track.estimate(this.player.frame);
        $("#trackobject" + this.id + "lost").attr("checked", e.outside);
        $("#trackobject" + this.id + "occluded").attr("checked", e.occluded);

        for (var i in this.job.attributes[this.track.label])
        {
            if (!this.track.estimateattribute(i, this.player.frame))
            {
                $("#trackobject" + this.id + "attribute" + i).attr("checked", false);
            }
            else
            {
                $("#trackobject" + this.id + "attribute" + i).attr("checked", true);
            }
        }
    }

    this.toggletooltip = function(onscreen)
    {
        if (this.tooltip == null)
        {
            this.showtooltip(onscreen);
        }
        else
        {
            this.hidetooltip();
        }
    }

    this.showtooltip = function(onscreen)
    {
        if (this.tooltip != null)
        {
            return;
        }

        var x;
        var y;

        if (onscreen || onscreen == null)
        {
            var pos = this.track.handle.position();
            var width = this.track.handle.width();
            var height = this.track.handle.height();

            var cpos = this.player.handle.position();
            var cwidth = this.player.handle.width();
            var cheight = this.player.handle.height();

            var displacement = 15;

            x = pos.left + width + displacement;
            if (x + 200 > cpos.left + cwidth)
            {
                x = pos.left - 200 - displacement;
            }

            y = pos.top;
            if (y + 200 > cpos.top + cheight)
            {
                y = cpos.top + cheight - 200 - displacement;
            }
        }
        else
        {
            var pos = this.handle.position();
            x = pos.left - 210;

            var cpos = this.player.handle.position();
            var cheight = this.player.handle.height();

            y = pos.top;
            if (y + 200 > cpos.top + cheight)
            {
                y = cpos.top + cheight - 215;
            }
        }

        var numannotations = 0;
        var frames = [];
        for (var i in this.track.journal.annotations)
        {
            if (!me.track.journal.annotations[i].outside)
            {
                numannotations++;
                frames.push(i);
            }
        }

        if (numannotations == 0)
        {
            return;
        }

        frames.sort();

        this.tooltip = $("<div class='boxtooltip'></div>").appendTo("body");
        this.tooltip.css({
            top: y + "px",
            left: x + "px"
        });
        this.tooltip.hide();
        var boundingbox = $("<div class='boxtooltipboundingbox boundingbox'></div>").appendTo(this.tooltip);

        var annotation = 0;
        var update = function() {
            if (annotation >= numannotations)
            {
                annotation = 0;
            }

            var frame = frames[annotation];
            var anno = me.track.journal.annotations[frame];
            var bw = anno.xbr - anno.xtl;
            var bh = anno.ybr - anno.ytl;

            var scale = 1;
            if (bw > 200)
            {
                scale = 200 / bw;
            }
            if (bh > 200)
            {
                scale = Math.min(scale, 200 / bh);
            }

            var x = (anno.xtl + (anno.xbr - anno.xtl) / 2) * scale - 100;
            var y = (anno.ytl + (anno.ybr - anno.ytl) / 2) * scale - 100;

            var bx = 100 - (anno.xbr - anno.xtl) / 2 * scale;
            var by = 100 - (anno.ybr - anno.ytl) / 2 * scale;
            bw = bw * scale;
            bh = bh * scale;

            if (x < 0)
            {
                bx += x;
                x = 0;
            }
            if (x > me.job.width * scale - 200)
            {
                bx = 200 - (me.job.width - anno.xtl) * scale;
                x = me.job.width * scale - 200;
            }
            if (y < 0)
            {
                by += y;
                y = 0;
            }
            if (y > me.job.height * scale - 200)
            {
                by = 200 - (me.job.height - anno.ytl) * scale;
                y = (me.job.height) * scale - 200;
            }

            x = -x;
            y = -y;

            console.log("Show tooltip for " + frame);
            me.tooltip.css("background-image", "url('" + me.job.frameurl(frame) + "')");
            me.tooltip.css("background-position", x + "px " + y + "px");
            var bgsize = (me.job.width * scale) + "px " + (me.job.height * scale) + "px";
            me.tooltip.css("background-size", bgsize);
            me.tooltip.css("-o-background-size", bgsize);
            me.tooltip.css("-webkit-background-size", bgsize);
            me.tooltip.css("-khtml-background-size", bgsize);
            me.tooltip.css("-moz-background-size", bgsize);
            annotation++;

            boundingbox.css({
                top: by + "px",
                left: bx + "px",
                width: (bw-4) + "px",
                height: (bh-4) + "px",
                borderColor: me.color[0]
            });
        }


        this.tooltiptimer = window.setInterval(function() {
            update();
        }, 500);

        this.tooltip.hide().slideDown(250);
        update();
    }

    this.hidetooltip = function()
    {
        if (this.tooltip != null)
        {
            this.tooltip.slideUp(250, function() {
                $(this).remove();
            });
            this.tooltip = null;
            window.clearInterval(this.tooltiptimer);
            this.tooltiptimer = null;
        }
    }

    this.disable = function()
    {
        if (this.ready)
        {
            $("#trackobject" + this.id + "lost").attr("disabled", true);
            $("#trackobject" + this.id + "occluded").attr("disabled", true);
        }
    }

    this.enable = function()
    {
        if (this.ready)
        {
            $("#trackobject" + this.id + "lost").attr("disabled", false);
            $("#trackobject" + this.id + "occluded").attr("disabled", false);
        }
    }

    this.statefoldup = function()
    {
        this.handle.addClass("trackobjectfoldedup");
        this.handle.removeClass("trackobjectfoldeddown");
        this.details.slideUp();
        this.headerdetails.fadeOut();
        this.foldedup = true;
        this._callback(this.onfoldup);

        //this.opencloseicon.removeClass("ui-icon-triangle-1-s");
        //this.opencloseicon.addClass("ui-icon-triangle-1-e");
    }

    this.statefolddown = function()
    {
        this.handle.removeClass("trackobjectfoldedup");
        this.handle.addClass("trackobjectfoldeddown");
        this.details.slideDown();
        this.headerdetails.fadeIn();
        this.foldedup = false;
        this._callback(this.onfolddown);

        //this.opencloseicon.removeClass("ui-icon-triangle-1-e");
        //this.opencloseicon.addClass("ui-icon-triangle-1-s");
    }

    this.mouseover = function()
    {
        this.highlight();

        if (this.track)
        {
            this.tracks.dim(true);
            this.track.dim(false);
            this.track.highlight(true);
        }

        if (this.opencloseicon)
        {
            this.opencloseicon.addClass("ui-icon-triangle-1-se");
        }
    }

    this.highlight = function()
    {
	// MA
	//console.log("highlight: " + this.id);
	this.tracks.currentid = this.id;
	this.tracks.currentptr = me;

        this.handle.css({
            'border-color': me.color[0],
            'background-color': me.color[1],
        });
    }

    this.mouseout = function()
    {
        this.unhighlight();

        if (this.track)
        {
            this.tracks.dim(false);
            this.track.highlight(false);
        }

        if (this.opencloseicon)
        {
            this.opencloseicon.removeClass("ui-icon-triangle-1-se");
        }
    }

    this.unhighlight = function()
    {
        this.handle.css({
            'border-color': me.color[2],
            'background-color': me.color[2],
        });
    }

    this.click = function()
    {
        return; // disable fold down
        if (this.ready)
        {
            if (this.foldedup)
            {
                this.statefolddown();
            }
            else
            {
                this.statefoldup();
            }
        }
    }

    this._callback = function(list)
    {
        for (var i = 0; i < list.length; i++)
        {
            list[i](me);
        }
    }
}
