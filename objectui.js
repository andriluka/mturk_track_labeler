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
	// MA: cam15
	//var w = [[5.769191766831823, 0.9579898937086545, -0.03874390282241155, 4.202530694630204e-05, -3.7253434730975154e-05, 1.7710142288792556e-05, -1.2041799346725057e-08, 4.339057903951504e-08], [0.21752284786780157, -0.024806054273730456, 0.9688564917770993, 2.536265046048855e-05, -8.247522741362551e-05, 5.98530583939506e-06, -6.568781740767804e-09, 1.165952412396365e-07], [-5.769192219241665, 1.04201010826945, 0.03874390301302042, -4.202530796345829e-05, 3.725343462830423e-05, -1.7710142287626985e-05, 1.2041799187130497e-08, -4.3390578990942785e-08], [-0.21752283166405154, 0.024806054234462565, 1.0311435084019676, -2.5362650445040838e-05, 8.247522705816203e-05, -5.985305826697752e-06, 6.568781713012228e-09, -1.1659524101759189e-07]];

	var w_generic = [[-0.9308369316462815, 0.9800341975905852, -0.01560491824447822, 1.708146944782591e-05, -5.201485289353807e-05, 1.5712946382171402e-06, -1.9928752259534832e-09, 4.583560854302948e-08], [-2.899563210931047, -0.0178858886913214, 1.004728823533341, 1.4641196949187994e-05, -0.0001607646152958801, 4.766147656274592e-06, -2.420121367197048e-09, 1.643143927587687e-07], [0.9308369250426697, 1.019965802180627, 0.015604918433561285, -1.7081469317242147e-05, 5.201485281057942e-05, -1.5712946712643881e-06, 1.992875387499607e-09, -4.58356085222128e-08], [2.899563178511022, 0.01788588871834666, 0.9952711766465967, -1.464119696835929e-05, 0.0001607646148709639, -4.766147656239464e-06, 2.420121367197048e-09, -1.6431439231467948e-07]];

	var w_cams = [[[9.585819952978825, 0.9656730605894436, -0.07549463423036355, 3.38306479622257e-05, 7.890766642220848e-05, 1.4055776446756242e-05, -1.021377090543174e-08, -4.50292973325217e-08], [2.631201536953968, -0.031721068342501366, 0.9842851797774762, 3.236775035142308e-05, -0.0001386339761527888, 1.8759088028533818e-05, -1.2029171825300722e-08, 1.5757480531508605e-07], [-9.585819797092306, 1.0343269390816385, 0.07549463404683143, -3.383064741814827e-05, -7.890766644800078e-05, -1.405577637765196e-05, 1.0213770808287226e-08, 4.50292973325217e-08], [-2.63120154488647, 0.03172106833802955, 1.0157148203126527, -3.236775034809545e-05, 0.0001386339759940603, -1.87590880285941e-05, 1.2029171880811873e-08, -1.5757480564815296e-07]], [[-3.852489903937623, 0.9811468784544284, 0.01260135529050324, 2.79604198063889e-05, -0.00011635449009886681, -1.3460678048911448e-05, -9.682761022665465e-09, 9.99825348485528e-08], [-9.547870928322093, -0.021416740958202507, 1.0717985723260741, 2.5985358514668544e-05, -0.0003207205203406365, -3.9341263476967703e-07, -9.478601181722723e-09, 2.8126462447986e-07], [3.852489980968027, 1.0188531216002905, -0.01260135524661439, -2.796041987286868e-05, 0.0001163544900759107, 1.3460678047783363e-05, 9.682761018328656e-09, -9.998253497692233e-08], [9.54787096208912, 0.02141674093707878, 0.9282014278161603, -2.5985358492079517e-05, 0.00032072051990360956, 3.934126354635664e-07, 9.478601126211572e-09, -2.812646241467931e-07]], [[1.5468118683470482, 0.9836860509198085, -0.04183279142495144, 1.3168183078822156e-05, 1.944675008027341e-05, -4.806804809710121e-06, 9.82818364018978e-10, -8.364880565991939e-09], [-3.0561281636922724, -0.01378283491691154, 1.0046187388421555, 5.158325002539103e-06, -0.00016287062247499285, 4.476870695838131e-06, 3.675330928487597e-09, 1.6834858496128646e-07], [-1.546811618919684, 1.0163139491284148, 0.04183279127140158, -1.3168183264352566e-05, -1.944675015736158e-05, 4.806804802602905e-06, -9.828180500340289e-10, 8.36488058680862e-09], [3.0561282763896327, 0.013782834895412337, 0.9953812607121678, -5.158324975689486e-06, 0.0001628706230596788, -4.476870694760434e-06, -3.675331067265475e-09, -1.6834858518333107e-07]], [[-0.8038415472403022, 0.983920262397062, -0.032658003536166026, 1.4438451343738845e-05, -3.03778603935919e-06, -8.719991554638319e-06, 1.5342435004742083e-09, 1.1667859955988291e-08], [-2.564839675347959, -0.014062380135916621, 0.9862489331501791, 1.1810412126512723e-05, -0.0001199379082551552, -1.1210831735585132e-06, 2.250892250366121e-10, 1.448154304251048e-07], [0.8038417052152383, 1.0160797375603494, 0.03265800368518428, -1.4438451328011056e-05, 3.0377860487333376e-06, 8.719991412906173e-06, -1.5342435594548065e-09, -1.1667859976804973e-08], [2.564839650111586, 0.014062380133850793, 1.0137510669959382, -1.1810412116657759e-05, 0.00011993790803332353, 1.1210831707625726e-06, -2.2508914176988526e-10, -1.448154306471494e-07]], [], [], [], [], [], [], [], [], [[-1.435772996103386, 0.9894358734890681, -0.02932146760111426, 8.345379250979243e-07, -1.89173419021641e-05, -2.4641801301992312e-06, 9.299427406947447e-09, 2.0669112432009085e-08], [1.4279191666509836, -0.026323927746313366, 0.9698843339240223, 2.995437546928284e-05, -8.046682437761431e-05, 1.1051423913284453e-05, -1.0552515417039388e-08, 1.0155691010371726e-07], [1.4357727441306802, 1.0105641276320887, 0.02932146824309139, -8.3453910205034e-07, 1.8917341880624988e-05, 2.4641800630546042e-06, -9.299427089493051e-09, -2.066911241466185e-08], [-1.4279191644389293, 0.026323927800590098, 1.030115665936626, -2.9954375504273947e-05, 8.046682448797568e-05, -1.105142391027037e-05, 1.0552515444794963e-08, -1.0155691021473956e-07]], [], [[5.322961488350117, 0.9604931184859266, -0.03706328395186271, 3.748377787939224e-05, -5.0679110882817285e-05, 1.8928878929784266e-05, -9.963437512094248e-09, 5.9391171154665745e-08], [-0.8886004593601172, -0.017060721191501284, 0.9694558090711525, 1.0927622606279885e-05, -8.407048509988203e-05, 5.9519324761741e-06, 6.933421337063095e-10, 1.1794426812983261e-07], [-5.32296164695245, 1.0395068819891173, 0.03706328400758295, -3.748377836009355e-05, 5.0679110894123454e-05, -1.8928878961790103e-05, 9.963437810900366e-09, -5.9391171099154594e-08], [0.8886004664878165, 0.01706072118870453, 1.0305441908673207, -1.0927622604288423e-05, 8.40704853205961e-05, -5.951932486112331e-06, -6.933421614618851e-10, -1.1794426835187721e-07]], [], [], [[-3.1685512528187973, 0.998253592995409, -0.005316681577434948, -1.2204999834384069e-05, -5.729815806410475e-05, -1.2162185315522134e-05, 1.7168431423806967e-08, 4.548391525568962e-08], [-7.866123504180843, 0.00033270396854401626, 1.0428994529749438, -1.3991135900343586e-05, -0.00023624072139199863, -1.0077894874413115e-05, 1.566006119224639e-08, 2.1422568008411247e-07], [3.168551450349415, 1.0017464063382422, 0.005316681316648654, 1.220500039820722e-05, 5.729815784975026e-05, 1.2162185204007078e-05, -1.7168431347479134e-08, -4.548391522012779e-08], [7.866123487660749, -0.00033270396106042233, 0.9571005471570793, 1.3991135884606175e-05, 0.00023624072116612245, 1.0077894851829184e-05, -1.566006119224639e-08, -2.1422567997309017e-07]], [[-0.7138626753659539, 0.98285951963887, -0.024676404301996437, 1.2556313345612444e-05, -3.884433847109683e-05, -2.656964638331368e-07, 6.452467293110997e-10, 4.8674999478942604e-08], [-2.5826146765612292, -0.012204489635241362, 0.9861276537892562, 6.565534957547921e-06, -0.00010813562387972878, -3.831032913734168e-06, 2.731180059889482e-09, 1.287528167415175e-07], [0.7138625725441614, 1.0171404803703654, 0.024676404459965724, -1.2556313344037125e-05, 3.8844338477026934e-05, 2.6569647407020757e-07, -6.452470437297297e-10, -4.867499950669818e-08], [2.5826146638834677, 0.012204489634111143, 1.0138723462640846, -6.5655349570700045e-06, 0.00010813562387764365, 3.8310329137892455e-06, -2.7311800737672698e-09, -1.287528166304952e-07]], [[3.5241270321169327, 0.9726587339331693, -0.050659431053542835, 2.445625272393874e-05, 4.2885017229577974e-05, 6.670100463064776e-06, -4.214463553749853e-09, -4.0222293898328765e-08], [-10.786616539657008, 0.015734662290035353, 0.985853337187326, -2.5726086075057025e-05, -6.86048025672222e-05, -9.077210734695015e-06, 1.5039338663314084e-08, 7.813418256841231e-08], [-3.5241263899990685, 1.0273412650968294, 0.05065943079366651, -2.445625212062723e-05, -4.288501717208658e-05, -6.6701002622133695e-06, 4.214463269905724e-09, 4.022229390526766e-08], [10.78661647831121, -0.01573466228937678, 1.014146663014395, 2.5726086076741442e-05, 6.86048025103146e-05, 9.077210734875427e-06, -1.503933862168072e-08, -7.813418245739001e-08]], [[-3.2699928877567275, 0.994402730852066, -0.04588011709806842, -6.21400626470473e-06, 3.646089435804784e-05, 5.908073420311116e-07, 9.009508251858062e-09, -3.2370176518414784e-08], [4.09003394466106, -0.033287901152021335, 0.9550493486544637, 2.676619212349258e-05, -1.8744548466237063e-05, 1.4641515095176715e-06, -4.358664103254473e-09, 4.876533477027323e-08], [3.269992912116636, 1.0055972687824426, 0.045880116914946534, 6.214006978556396e-06, -3.646089435672128e-05, -5.908073432894773e-07, -9.009508371770822e-09, 3.2370176518414784e-08], [-4.090033901587916, 0.033287901142613104, 1.044950651256303, -2.676619211453707e-05, 1.8744548434648182e-05, -1.4641515101417382e-06, 4.358664089376685e-09, -4.8765334659250925e-08]], []];

	ma_assert(job.camidx >= 0, "error: missing camera index");

	if (w_cams[job.camidx].length > 0) {
	    console.log('using parameters for camera ' + job.camidx);
	    w = w_cams[job.camidx];
	}
	else {
	    console.log('camera-specific parameters undefined, using generic parameters');
	    w = w_generic;
	}


	// if (job.camidx >= 0 && w_cams[job.camidx].length > 0) {
	//     console.log('using parameters for camera ' + job.camidx);
	//     w = w_cams[job.camidx];
	// }
	// else {
	//     console.log('using generic parameters');
	//     w = w_generic;
	// }

    	var f = [1, xc, yc, xc*xc, yc*yc, xc*yc, xc*xc*xc, yc*yc*yc];

	var x1 = Math.round(dotprod(w[0], f));
	var y1 = Math.round(dotprod(w[1], f));

	var x2 = Math.round(dotprod(w[2], f));
	var y2 = Math.round(dotprod(w[3], f));

	console.log("(" + x1 + "," + y1 + ")" + ", (" + x2 + "," + y2 + ")");

	return new Position(x1, y1, x2, y2);
	//return [x1, y1, x2, y2];
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
