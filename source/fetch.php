<?php
	if (empty($_GET['id'])) {
		 header('HTTP/1.1 400 Bad Request');
		 exit;
	}

	$ch = curl_init();

	curl_setopt_array($ch, array(
		CURLOPT_URL => 'http://zpovednice.cz/detail.php?statusik=' . $_GET['id'],
		CURLOPT_HEADER => false,
		CURLOPT_RETURNTRANSFER => true
	));

	$result = preg_replace("/.*<body[^>]*>|<\/body>.*/si", "", curl_exec($ch));

	curl_close($ch);

	echo iconv('Windows-1250', 'UTF-8', $result);
?>