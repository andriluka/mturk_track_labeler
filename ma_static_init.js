var tracks = null;
var job = new Job();

function ma_assert(condition, message) {
    if (!condition) {
	window.alert(message);
    }
}

function gup(name){
    var regexS = "[\\?&]"+name+"=([^&#]*)";
    var regex = new RegExp( regexS );
    var tmpURL = window.location.href;
    var results = regex.exec( tmpURL );

    if( results == null)
	return "";
    else
	return results[1];
}

function gup_image_width() {
    var imgwidth = gup("imgwidth");
    if (imgwidth == "")
	imgwidth = 1280;
    return imgwidth;
}

function gup_image_height() {
    var imgheight = gup("imgheight");
    if (imgheight == "")
	imgheight = 960;
    return imgheight;
}

function init_objectui() {

    imgname = gup("imgname");
    if (imgname.substring(0, 4) != "http") {
	// compact version - workaround because hit input is limited to 255 characters
	sidx = imgname.lastIndexOf('_');
	parent_dir = imgname.substring(0, sidx);
	imgname = "https://s3.amazonaws.com/sv-images/driving_data_q50_data/" + parent_dir + "/" + imgname;
    }

    var imgwidth = gup_image_width();
    var imgheight = gup_image_height();

    console.log("get image name: " + imgname);
    console.log("image width: " + imgwidth + ", image height: " + imgheight);

    //var job = new Job();

    job.slug = "Slug: string job id ";
    job.start = 0;
    job.stop = 2;

    job.width = imgwidth;
    job.height = imgheight;

    // vatic default
    //job.width = 1280;
    //job.height = 720;

    // Q50 narrow field of view camera
    // job.width = 1280;
    // job.height = 960;

    // Q50 wide field of view camera
    //job.width = 1040;
    //job.height = 520;

    job.skip = 0;
    job.perobject = 0;
    job.completion = 0;
    job.blowradius = 0;
    job.jobid = 5;

    job.labels = new Array();
    //job.labels[0] = "Car";
    job.labels[0] = "Person";

    job.attributes = [];
    job.training = 0;

    //var param_min_box_width = gup("min_box_width");
    var param_min_box_width = gup("mw");
    if (param_min_box_width != "")
	job.min_box_width = Number(param_min_box_width);

    //var param_object_bonus_usd = gup("object_bonus_usd");
    var param_object_bonus_usd = gup("ob");
    if (param_object_bonus_usd != "")
	job.object_bonus_usd = Number(param_object_bonus_usd);

    var param_camidx = gup("camidx");
    if (param_camidx != "") {
	job.camidx = Number(param_camidx);
	console.log("camidx: " + job.camidx);
    }
    
    job.frameurl = function(i)
    {
	return imgname;

        // folder1 = parseInt(Math.floor(i / 100));
        // folder2 = parseInt(Math.floor(i / 10000));
        // return "frames/" + me.slug + 
        //     "/" + folder2 + "/" + folder1 + "/" + parseInt(i) + ".jpg";
    }

    var videoframe = $("#videoframe");
    // videoframe.css("width", "1024px");
    // videoframe.css("height", "720px");

    //videoframe.css("width", "1280px");
    //videoframe.css("height", "960px");
    
    videoframe.css("width", job.width + "px");
    videoframe.css("height", job.height + "px");

    var player = new VideoPlayer(videoframe, job);

    $("#topbar").append("<div id='newobjectcontainer'><div class='button' id='newobjectbutton'>New Object</div></div>");
    $("<div id='objectcontainer'></div>").appendTo("#sidebar");

    //var tracks = new TrackCollection(player, job);
    tracks = new TrackCollection(player, job);

    var objectui = new TrackObjectUI($("#newobjectbutton"), $("#objectcontainer"), videoframe, job, player, tracks);

    // init video slider
    $("#bottombar").append("<div id='playerslider'></div>");
    $("#bottombar").append("<div class='button' id='rewindbutton'>Rewind</div> ");
    $("#bottombar").append("<div class='button' id='playbutton'>Play</div> ");

    // MA: pre-load objects 
    //var preload_rects_param = gup("rects");
    var preload_rects_param = gup("r");
    if (preload_rects_param != "") {
	//var tokens = preload_rects_param.split(',');
	//ma_assert(tokens.length % 4 == 0);

	// decode rects 
	ma_assert(preload_rects_param.length % 8 == 0) // nrects * 4 points * 2 chars per point

	var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	var alpha_len = chars.length;
	var chars_map = {};
	for (var idx = 0; idx < chars.length; ++idx) {
	    chars_map[chars[idx]] = idx;
	}

	var tokens = [];
	for (var idx = 0; idx < preload_rects_param.length; idx += 2) {
	    var a1 = chars_map[preload_rects_param[idx]];
	    var a2 = chars_map[preload_rects_param[idx+1]];
	    tokens[tokens.length] = a1*alpha_len + a2;
	}

	var add_labelid = 0;
	var add_frameidx = 0;
	var add_attributes = [];

	for (var idx = 0; idx < tokens.length; idx += 4) {
	    //var add_pos = [parseInt(tokens[idx]), parseInt(tokens[idx+1]), parseInt(tokens[idx+2]), parseInt(tokens[idx+3])];
	    var add_pos = [tokens[idx], tokens[idx+1], tokens[idx+2], tokens[idx+3]];

	    // x1, y1, x2, y2, frameidx, occluded, truncated 
	    add_path = [[add_pos[0], add_pos[1], add_pos[2], add_pos[3], add_frameidx, 0, 0]];
	    var add_obj = objectui.injectnewobject(add_labelid, add_path, add_attributes);
	    add_obj.track.onupdate.push(function(){add_obj.updateboxtext();});
	    add_obj.track.preloaded_pos = add_pos;
	    objectui.objects.push(add_obj);	    
	} 
    }
    
    var new_bonus_object_count = count_bonus_objects(job, tracks);
    ui_update_bonus_display(new_bonus_object_count, job.object_bonus_usd);

    ui_setupkeyboardshortcuts(job, player, tracks);
    ui_setupbuttons(job, player, tracks);

    ui_setupslider(player);

}

// what to submit to AMT server
function get_results_string(){
    imgname = gup("imgname");
    var result = "label_cars, " + imgname;

    // for (var tidx = 0; tidx < tracks.tracks.length; ++tidx) {
    // 	console.log("track " + tidx + ": " + tracks.tracks[tidx].label);
    // }
    
    for (var tidx = 0; tidx < tracks.tracks.length; ++tidx) {
	console.log("track: " + tidx + ", deleted: " + tracks.tracks[tidx].deleted);

	if (!tracks.tracks[tidx].deleted) {
    	    result += "," + tracks.tracks[tidx].journal.annotations[0].xtl; 
    	    result += "," + tracks.tracks[tidx].journal.annotations[0].ytl; 
    	    result += "," + tracks.tracks[tidx].journal.annotations[0].xbr; 
    	    result += "," + tracks.tracks[tidx].journal.annotations[0].ybr; 
    	    result += "," + Number(tracks.tracks[tidx].journal.annotations[0].occluded); 
    	    result += "," + Number(tracks.tracks[tidx].journal.annotations[0].outside); 
	}
    }

    console.log("result: " + result);
    return result;
}

// grab the results and submit to the server
function submitResults(){
    var results = get_results_string();
    document.getElementById('object_bbox').value = results;

    document.forms["mturk_form"].submit();
}
