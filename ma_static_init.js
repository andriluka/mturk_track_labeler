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

function gup_num_frames() {
    var num_frames = gup("n");
    if (num_frames == "")
	num_frames = 1;
    else
	num_frames = parseInt(num_frames, 10);

    return num_frames;
}

function gup_frame_step() {
    var framestep = gup("st");
    if (framestep == "")
	framestep = 1;
    else
	framestep = parseInt(framestep, 10);

    return framestep;
}

// PA : Generate Image URL
function img_url(i) {
	var imagename = gup("imgname");
        var num_frames = gup_num_frames();
        var framestep = gup_frame_step();
	var idxfname = imagename.lastIndexOf('/');
	var fpath = imagename.substring(0, idxfname)
	var fname = imagename.substring(idxfname + 1);

	var idxext = fname.lastIndexOf('.');
	var fext = fname.substring(idxext + 1);
	fname = fname.substring(0, idxext)

	var frameidx = parseInt(fname, 10)
	var is_zero_pad = false;
	if (fname.length > frameidx.toString().length)
	    is_zero_pad = true;

	next_frameidx_str = (frameidx + i*framestep).toString()

	if (is_zero_pad) {
	    while (next_frameidx_str.length < fname.length)
		next_frameidx_str = "0" + next_frameidx_str;
	}

	urlstr = fpath + "/" + next_frameidx_str + "." + fext
	return urlstr;
}

// PA : Preload Images  
function preload_images() {
    //$("#tool_container").hide();
    $("#submit_container").hide(); 
    $("#intro_text").hide(); 

    var allImages = [];
    for (var i=0; i < gup_num_frames(); ++i) {
      allImages.push(img_url(i));
    }
    preload(allImages, preloadslider($("#loadingscreenslider"), function(progress) {
        if (progress == 1)
        {
          $("#loadingscreen").remove();
          //$("#tool_container").show();
          $("#submit_container").show();
          $("#intro_text").show(); 
          init_objectui();
        }
      })
    );
}

function init_objectui() {

    imgname = gup("imgname");
    num_frames = gup_num_frames();
    framestep = gup_frame_step();

    console.log("num_frames:" + num_frames)

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
    //job.stop = 2;
    job.stop = num_frames - 1;

    job.width = imgwidth;
    job.height = imgheight;

    job.skip = 0;
    job.perobject = 0;
    job.completion = 0;
    job.blowradius = 0;
    job.jobid = 5;

    job.labels = new Array();
    //job.labels[0] = "Car";
    job.labels[0] = "Person";
    //job.labels[1] = "Clothing Item";

    //job.attributes = [["Staff+", "Examining products+"]];
    job.attributes = [["Examining products+"]];
    //job.attributes = [[]];
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
    
    job.frameurl = img_url; 

    var videoframe = $("#videoframe");
    
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

	var add_path = [];
	for (var idx = 0; idx < tokens.length; idx += 4) {
	    var add_pos = [tokens[idx], tokens[idx+1], tokens[idx+2], tokens[idx+3]];

	    // x1, y1, x2, y2, frameidx, occluded, truncated 
	    add_path.push([add_pos[0], add_pos[1], add_pos[2], add_pos[3], add_frameidx, 0, 0]);
	    add_frameidx += 1;
	} 

	var add_obj = objectui.injectnewobject(add_labelid, add_path, add_attributes);
	add_obj.track.onupdate.push(function(){add_obj.updateboxtext();});
	add_obj.track.preloaded_pos = add_pos;
	objectui.objects.push(add_obj);	    
    }
    
    var new_bonus_object_count = count_bonus_objects(job, tracks);
    ui_update_bonus_display(new_bonus_object_count, job.object_bonus_usd);

    ui_setupkeyboardshortcuts(job, player, tracks);
    ui_setupbuttons(job, player, tracks);

    ui_setupslider(player);
}

// what to submit to AMT server

/*
  format
  "track_labeler", <image_name>,
  num_track_attributes
  attribute_name1, ..., attribute_nameN
  num_frames, 
  for each frame:
  num_tracks_in_this_frame, track_id, x1, y1, x2, y2, attribute_val1, ..., attribute_valN
*/

function get_results_string(){
    
    var result = {task_type: 'track_labeler'}

    // MA: assume there is only one object type
    result.imgname = imgname
    result.attributes = job.attributes[0]
    result.num_frames = gup_num_frames()

    result.frames = [];

    for (var fidx = 0; fidx < num_frames; ++fidx) {
	var cur_frame = []
	for (var tidx = 0; tidx < tracks.tracks.length; ++tidx) {
	    if (!tracks.tracks[tidx].deleted) {
		
		// skip frames where object is marked as "outside"
		if (fidx in tracks.tracks[tidx].journal.annotations) 
		    if (tracks.tracks[tidx].journal.annotations[fidx].outside)
			continue;

		est_pos = tracks.tracks[tidx].estimate(fidx)

		var cur_pos = {
		    id: tidx,
		    x1: est_pos.xtl,
    		    y1: est_pos.ytl, 
    		    x2: est_pos.xbr,
    		    y2: est_pos.ybr,
		}

		var cur_attrib = []
		var num_attributes = job.attributes[0].length
		for (var aidx = 0; aidx < num_attributes; ++aidx) 
		    cur_attrib.push(tracks.tracks[tidx].estimateattribute(aidx, fidx))
		
		cur_frame.push({pos: cur_pos, attrib: cur_attrib})

	    }
	}
	result.frames.push(cur_frame)
    }

    return JSON.stringify(result)
}

// grab the results and submit to the server
function submitResults(){
    var results = get_results_string();
    console.log(results)

    document.getElementById('object_bbox').value = results;

    // MA: temporary
    //document.forms["mturk_form"].submit();
}
