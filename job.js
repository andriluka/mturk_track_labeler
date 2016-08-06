// MA
function ma_assert(cond, msg) {
    if (!cond) {
	window.alert("ma_assert: " + msg);
	console.log("ma_assert: " + msg);
    }
}

function Job(data)
{
    var me = this;

    this.slug = null;
    this.start = null;
    this.stop = null; 
    this.width = null; 
    this.height = null; 
    this.skip = null; 
    this.perobject = null;
    this.completion = null;
    this.blowradius = null;
    this.thisid = null;
    this.labels = null;

    // MA
    this.bonus_object_count = 0;
    this.min_box_width = 25;
    this.object_bonus_usd = 0.00;
    this.camidx = -1;
    this.do_interpolate = false;
    this.do_move_on_click = true;
   
    this.frameurl = function(i)
    {
        folder1 = parseInt(Math.floor(i / 100));
        folder2 = parseInt(Math.floor(i / 10000));
        return "frames/" + me.slug + 
            "/" + folder2 + "/" + folder1 + "/" + parseInt(i) + ".jpg";
    }

    function dotprod(x1, x2) 
    {
    	ma_assert(x1.length == x2.length);
	var res = 0;

	for (var idx = 0; idx < x1.length; ++idx)
	    res += x1[idx]*x2[idx];

	return res;
    }  

    this.job_predict_box = function(xc, yc)  {

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

	ma_assert(this.camidx >= 0, "error: missing camera index");

	if (this.camidx < w_cams.length && w_cams[this.camidx].length > 0) {
	    console.log('using parameters for camera ' + this.camidx);
	    w = w_cams[this.camidx];

    	    var f = [1, xc, yc, xc*xc, yc*yc, xc*yc, xc*xc*xc, yc*yc*yc];

	    var x1 = Math.round(dotprod(w[0], f));
	    var y1 = Math.round(dotprod(w[1], f));

	    var x2 = Math.round(dotprod(w[2], f));
	    var y2 = Math.round(dotprod(w[3], f));

	    console.log("(" + x1 + "," + y1 + ")" + ", (" + x2 + "," + y2 + ")");

	    return new Position(x1, y1, x2, y2);
	}
	else {
	    console.log('camidx: ' + this.camidx); 
	    console.log('num_cams:: ' + w_cams.length); 
	    if (this.camidx < w_cams.length) {
		console.log('num_params:: ' + w_cams[this.camidx].length); 
	    }
	    alert('camera-specific parameters undefined!!!');
	}
    }


}

function job_import(data)
{
    var job = new Job();
    job.slug = data["slug"];
    job.start = parseInt(data["start"]);
    job.stop = parseInt(data["stop"]);
    job.width = parseInt(data["width"]);
    job.height = parseInt(data["height"]);
    job.skip = parseInt(data["skip"]);
    job.perobject = parseFloat(data["perobject"]);
    job.completion = parseFloat(data["completion"]);

    // MA 
    //job.blowradius = parseInt(data["blowradius"]);
    job.blowradius = 0;

    job.jobid = parseInt(data["jobid"]);
    job.labels = data["labels"];
    job.attributes = data["attributes"];
    job.training = parseInt(data["training"]);

    console.log("Job configured!");
    console.log("  Slug: " + job.slug);
    console.log("  Start: " + job.start);
    console.log("  Stop: " + job.stop);
    console.log("  Width: " + job.width);
    console.log("  Height: " + job.height);
    console.log("  Skip: " + job.skip);
    console.log("  Per Object: " + job.perobject);
    console.log("  Completion: " + job.completion);
    console.log("  Blow Radius: " + job.blowradius);
    console.log("  Training: " + job.training);
    console.log("  Job ID: " + job.jobid);
    console.log("  Labels: ");
    for (var i in job.labels)
    {
        console.log("    " + i + " = " + job.labels[i]);
    }
    console.log("  Attributes:");
    for (var i in job.attributes)
    {
        for (var j in job.attributes[i])
        {
            console.log("    " + job.labels[i] + " = " + job.attributes[i][j])
        }
    }

    return job;
}
