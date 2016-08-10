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

    // MA: predicted bounding box 
    this.stopdrawing_predict = function(click_pos)
    {
        console.log("stopdrawing_predict: Received new track object drawing");
	console.log("click_pos: " + click_pos);

	ma_assert(click_pos.length == 2);
	//position = predict_box(click_pos[0], click_pos[1]);
	position = this.job.job_predict_box(click_pos[0], click_pos[1]);
	console.log("position: " + position);

        //this.currentcolor = this.pickcolor();
        var track = tracks.add(player.frame, position, this.currentcolor[0]);
	this.job.last_track = track;

        this.drawer.disable();
        ui_disable();

        this.currentobject.onready.push(function() {
            me.stopnewobject();
        });

        //me.stopnewobject();

	this.currentobject.initialize(this.counter, track, this.tracks);
        this.currentobject.stateclassify();

	// MA: currently used to access track in ui_setupkeyboardshortcuts
	this.tracks.currentid = this.currentobject.id
	this.tracks.currentptr = this.currentobject

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
            track.attributejuiournals[attributes[i][0]].mark(attributes[i][1], attributes[i][2]);
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

	// MA: 
	if (job.do_move_on_click) {
	    this.drawer.onclick = function(xc, yc) {
		var offset = videoframe.offset();

		var page_xc = xc + offset.left;
		var page_yc = yc + offset.top;

		// check if ggwe are inside some rect (if yes we interfere with drag'n'drop)
		var is_in_rect = false;

		for (var tidx = 0; tidx < tracks.tracks.length; ++tidx) {
		    var bounds = tracks.tracks[tidx].journal.bounds(player.frame);

		    // MA: rectangles are visible all the time so this check does not make sence 
		    left_outside = false;
		    right_outside = false;

		    // left_outside = true;
		    // if (bounds['left'] != null) 
		    // 	left_outside = bounds['left'].outside;

		    // right_outside = true;
		    // if (bounds['right'] != null)
		    // 	right_outside = bounds['right'].outside;

		    // MA: only check tracks that are inside the frame
		    if (!left_outside && !right_outside) {
			var cur_l = parseInt(tracks.tracks[tidx].handle.css("left"));
			var cur_t = parseInt(tracks.tracks[tidx].handle.css("top"));
			var cur_r = cur_l + parseInt(tracks.tracks[tidx].handle.css("width"));
			var cur_b = cur_t + parseInt(tracks.tracks[tidx].handle.css("height"));

			if (page_xc >= cur_l && page_xc <= cur_r && page_yc >= cur_t && page_yc <= cur_b) {
		    	    is_in_rect = true;
		    	    break;
			}
		    }
		}

		console.log('is_in_rect: ' + is_in_rect);

		if (tracks && !is_in_rect) {
		    if (tracks.tracks) {
			if (tracks.tracks.length > 0) {
			    if (job.last_track != null) {
				var edit_track = job.last_track;
				
				edit_track.handle.css("left", page_xc - parseInt(edit_track.handle.css("width"))/2);
				edit_track.handle.css("top", page_yc - parseInt(edit_track.handle.css("height"))/2);

				edit_track.fixposition();
				edit_track.recordposition();                
				edit_track.notifyupdate();
			    }
			}
		    }
		}
	    };
	}





	// MA
        //var html = "<p>In this video, please track all of these objects:</p>";

	var num_hints = 1;
	var hintidx = Math.floor(Math.random()*num_hints);

	var html = "<div id='bonus_counter'><p align='center'>Bonus for labeled objects:<br><font color='DarkOrange'>0.00 USD</font></p></div>";

        html += "<p align='center'>Keyboard shortcuts: <font color='blue'>'n'</font> - new object, <font color='blue'>'t'</font> - toggle 'outside of view frame' state, <font color='blue'>'e'</font> - toggle 'examining products' state, <font color='blue'>'d'</font> - delete object, <font color='blue'>'c'</font> - seek back by one frame, <font color='blue'>'v'</font> - seek forward by one frame.</p><p align='center'>Other shortcuts: <font color='blue'>'mouse click'</font> - move the most recently edited object to the click location</p>";

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
                //str += "<br>";
                str += ", ";
                str += this.job.attributes[this.track.label][i][0] + ".";
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
	// MA: added back since we are tracking objects now
        this.details.append("<input type='checkbox' id='trackobject" + this.id + "lost'> <label for='trackobject" + this.id + "lost'>Outside of view frame</label><br>");

	// MA: not showing the visible/hidden checkbox for now
        //this.details.append("<div style='display:none'><input type='checkbox' id='trackobject" + this.id + "occluded'> <label for='trackobject" + this.id + "occluded'>Occluded or truncated</label><br></div>");

	if (this.track.label < this.job.attributes.length) {
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
