/*
#asset(qx/icon/${qx.icontheme}/16/emotes/face-smile.png)
#asset(qx/icon/${qx.icontheme}/22/actions/document-new.png)
#asset(qx/icon/${qx.icontheme}/22/actions/document-open.png)
#asset(qx/icon/${qx.icontheme}/22/actions/dialog-close.png)
#asset(qx/icon/${qx.icontheme}/22/actions/view-refresh.png)
*/
qx.Class.define('confessor.Application', {
	extend : qx.application.Standalone,
	members : {
		_store : null,
		_table : null,
		_win : null,
		_queue : [],
		_timer : null,

		main : function() {
			this.base(arguments);

			this._store = new Persist.Store('Confessor', {
				swf_path : './persistjs/persist.swf'
			});

			this.getRoot().add(this._createWindow());

			this._timer = new qx.event.Timer(5000);
			this._timer.addListener('interval', this._onUpdateInterval, this);
		},

		_createRequest : function(id) {
			var req = new qx.io.remote.Request('fetch.php?id=' + id, 'GET', 'text/html').set({
				timeout : 20000
			});
			req.addListener('aborted', function() {
				this._win.setStatus([id, this.tr('request aborted')].join(' '));
			}, this);
			req.addListener('failed', function() {
				this._win.setStatus([id, this.tr('request failed')].join(' '));
			}, this);
			req.addListener('sending', function() {
				this._win.setStatus([id, this.tr('sending request')].join(' '));
			}, this);
			req.addListener('timeout', function() {
				this._win.setStatus([id, this.tr('request timeout')].join(' '));
			}, this);
			return req;
		},

		_createTable : function() {
			var data = [];
			this._store.get('ids', function(ok, val) {
				if (ok && val) {
					var ids = val.toString().split(',');
					for (var i = 0, l = ids.length; i < l; i++) {
						this._store.get(ids[i], function(ok, obj) {
							if (ok && obj) {
								obj = qx.util.Json.parse(obj.toString());
								data.push([
									obj.id,
									obj.title,
									obj.author,
									obj.comments,
									obj.news
								]);
							}
						}, this);
					}
					this._win.setStatus(this.tr('Ready'));
				} else
					this._win.setStatus(this.tr('No saved confessions'));
			}, this);
			var tableModel = new qx.ui.table.model.Simple().set({
				columns: [
					'#',
					this.tr('Title'),
					this.tr('Author'),
					this.tr('Comments'),
					this.tr('News')
				],
				data: data
			});
			this._table = new qx.ui.table.Table(tableModel).set({
				decorator: null,
				columnVisibilityButtonVisible : false
			});
			this._table.getTableColumnModel().setDataCellRenderer(1, new qx.ui.table.cellrenderer.Html());
			this._table.addListener('cellDblclick', this._onViewRequest, this);
		},

		_createToolbar : function() {
			var addButton = new qx.ui.toolbar.Button(this.tr('New'), 'icon/22/actions/document-new.png');
			addButton.addListener('execute', function() {
				var id;
				if (id = prompt(this.tr('Confession number')))
					this._store.get('ids', function(ok, val) {
						if (ok && val) {
							ids = val.toString().split(',');
						} else {
							ids = [];
						}
						if (qx.lang.Array.contains(ids, id)) {
							this._win.setStatus([id, this.tr('is already saved')].join(' '));
						} else {
							this._win.setStatus([this.tr('Trying to fetch'), id].join(' '));
							var req = this._createRequest(id);
							req.addListener('completed', this._onAddRequest, this);
							req.send();
						}
					}, this);
			}, this);
			var viewButton = new qx.ui.toolbar.Button(this.tr('View'), 'icon/22/actions/document-open.png').set({
				enabled : false
			});
			viewButton.addListener('execute', this._onViewRequest, this);
			var deleteButton = new qx.ui.toolbar.Button(this.tr('Delete'), 'icon/22/actions/dialog-close.png').set({
				enabled : false
			});
			deleteButton.addListener('execute', this._onDeleteRequest, this);
			var updateButton = new qx.ui.toolbar.Button(this.tr('Update'), 'icon/22/actions/view-refresh.png').set({
				enabled : (this._table.getTableModel().getData().length > 0) && this._queue.length == 0
			});
			updateButton.addListener('execute', function() {
				var data = this._table.getTableModel().getData();
				for (var i = 0, l = data.length; i < l; i++) {
					if (!qx.lang.Array.contains(this._queue, data[i][0]))
						this._queue.push(data[i][0]);
				}
				this._win.setStatus(this.tr('Update started'));
				if (!this._timer.isEnabled())
					this._timer.start();
			}, this);
			this._table.getTableModel().addListener('dataChanged', function(e) {
				var empty = e.getData().lastRow == -1;
				updateButton.setEnabled(!empty && this._queue.length == 0);
				if (empty) {
					viewButton.setEnabled(false);
					deleteButton.setEnabled(false);
				}
			}, this);
			this._table.getSelectionModel().addListener('changeSelection', function(e) {
				var empty = this._table.getSelectionModel().isSelectionEmpty();
				viewButton.setEnabled(!empty);
				deleteButton.setEnabled(!empty);
			}, this);
			var toolbar = new qx.ui.toolbar.ToolBar();
			toolbar.add(addButton);
			toolbar.add(viewButton);
			toolbar.add(deleteButton);
			toolbar.add(updateButton);
			return toolbar;
		},

		_createWindow : function() {
			this._win = new qx.ui.window.Window(this.tr('Confessor'), 'icon/16/emotes/face-smile.png').set({
				contentPadding : [ 0, 0, 0, 0 ],
				layout: new qx.ui.layout.VBox(),
				showClose: false,
				showMinimize: false,
				showStatusbar: true,
				status: this.tr('Starting')
			});
			this._createTable();
			this._win.add(this._createToolbar());
			this._win.add(this._table);
			this._win.addListener('resize', this._win.center, this._win);
			this._win.open();
			return this._win;
		},

		_getSelectedId : function() {
			return this._table.getTableModel().getRowData(this._getSelectedIndex())[0];
		},

		_getSelectedIndex : function() {
			return this._table.getSelectionModel().getLeadSelectionIndex();
		},

		_onAddRequest : function(e) {
			var obj, ids;
			if (obj = this._parse(e.getContent()))
				this._store.get('ids', function(ok, val) {
					if (ok && val)
						ids = val.toString().split(',');
					else
						ids = [];
					ids.push(obj.id);
					this._store.set('ids', ids.join(','));
					this._store.set(obj.id, qx.util.Json.stringify(obj));
					this._table.getTableModel().addRows([[
						obj.id,
						obj.title,
						obj.author,
						obj.comments,
						obj.news
					]], 0);
					this._win.setStatus([obj.id, this.tr('added')].join(' '));
				}, this);
			else
				this._win.setStatus(this.tr('Confession not found'));
		},

		_onDeleteRequest : function() {
			var index = this._getSelectedIndex();
			var id = this._getSelectedId();
			this._table.getTableModel().removeRows(index, 1);
			qx.lang.Array.remove(this._queue, id);
			this._store.remove(id, function(ok, val) {});
			this._store.get('ids', function(ok, val) {
				var ids = val.toString().split(',');
				qx.lang.Array.remove(ids, id);
				this._store.set('ids', ids.join(','));
			}, this);
			this._win.setStatus([id, this.tr('deleted')].join(' '));
		},

		_onUpdateInterval : function() {
			var id = qx.lang.Array.removeAt(this._queue, 0);
			if (this._queue.length == 0)
				this._timer.stop();
			this._win.setStatus([this.tr('Updating'), id].join(' '));
			var req = this._createRequest(id);
			req.addListener('completed', this._onUpdateRequest, this);
			req.send();
		},

		_onUpdateRequest : function(e) {
			var obj = this._parse(e.getContent());
			if (obj)
				this._store.get(obj.id, function(ok, val) {
					var stored = qx.util.Json.parse(val.toString());
					if (stored.comments < obj.comments) {
						var data = this._table.getTableModel().getData();
						for (var i = 0, l = data.length; i < l; i++) {
							if (data[i][0] == obj.id) {
								this._table.getTableModel().setValue(3, i, obj.comments);
								obj.news += obj.comments - stored.comments;
								this._table.getTableModel().setValue(4, i, obj.news);
								this._store.set(obj.id, qx.util.Json.stringify(obj));
								break;
							}
						}
						this._win.setStatus([id, this.tr('updated')].join(' '));
					} else {
						this._win.setStatus([id, this.tr('unchanged')].join(' '));
					}
				}, this);
			else
				this._win.setStatus(this.tr('Confession not found'));
		},

		_onViewRequest : function() {
			var id = this._getSelectedId();
			this._store.get(id, function(ok, val) {
				var obj = qx.util.Json.parse(val.toString());
				if (obj.news > 0) {
					var data = this._table.getTableModel().getData();
					for (var i = 0, l = data.length; i < l; i++) {
						if (data[i][0] == id) {
							this._table.getTableModel().setValue(4, i, 0);
							this._store.set(obj.id, qx.util.Json.stringify(obj));
							break;
						}
					}
				}
			}, this);
			window.open('http://zpovednice.cz/detail.php?statusik=' + id, '_blank');
		},

		_parse : function(content) {
			var coll = qx.bom.Collection.html(content);
			var id = coll.find(':input[NAME=ciselko]').getAttribute('value');
			if (id)
				return {
					id : id,
					title : qx.lang.String.trim(coll.find('td.confheader').getAttribute('text')),
					author : qx.lang.String.trim(coll.find('span.signnick, span.signunreg').getAttribute('text')),
					comments : coll.find('td.sectlheader').length,
					news : 0
				};
			return false;
		}
	}
});
